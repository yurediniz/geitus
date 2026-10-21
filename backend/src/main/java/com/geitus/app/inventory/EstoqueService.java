package com.geitus.app.inventory;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import com.geitus.app.catalog.Paginacao;
import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoConflitoException;
import com.geitus.app.catalog.ProdutoNaoEncontradoException;
import com.geitus.app.catalog.ProdutoRepository;
import com.geitus.app.catalog.QuantidadeDeEstoque;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.inventory.dto.AjusteEstoqueRequest;
import com.geitus.app.inventory.dto.MovimentoEstoqueResponse;

/**
 * Regras do estoque do produto (docs/modules/produtos-estoque.md, 4.1 a 4.5;
 * DEC-034).
 *
 * <p>O saldo so muda por {@link #registrarMovimento}, que garante a linha de
 * saldo, a trava ({@code FOR UPDATE}), calcula a variacao pelo saldo travado,
 * aplica e grava o movimento, tudo na transacao de quem chama. Toda escrita de
 * estoque trava antes a linha do produto ({@code buscarPorUuidParaAtualizar}),
 * a mesma trava da edicao e da exclusao do produto: as operacoes sobre um
 * produto ficam em fila.
 *
 * <p>Como nos outros services, a API publica recebe o {@code idUsuario} do JWT
 * e resolve a empresa (DEC-016); produto de outra empresa responde 404. O
 * usuario do movimento e sempre o autenticado.
 */
@Service
public class EstoqueService {

    static final String CAMPO_QUANTIDADE = "quantidade";
    static final String CAMPO_MOTIVO = "motivo";
    static final String CAMPO_OBSERVACAO = "observacao";

    static final String MENSAGEM_SEM_CONTROLE = "Este produto não controla estoque.";
    static final String MENSAGEM_MOTIVO_DO_SISTEMA = "Este motivo é registrado só pelo sistema.";
    static final String MENSAGEM_MOTIVO_DE_OUTRO_TIPO = "Este motivo não vale para o tipo de movimento escolhido.";
    static final String MENSAGEM_DESCREVA_O_MOTIVO = "Descreva o motivo.";
    static final String MENSAGEM_SALDO_INSUFICIENTE = "Saldo insuficiente: há %s.";
    static final String MENSAGEM_SALDO_IGUAL = "O saldo já é %s.";
    static final String MENSAGEM_SALDO_ACIMA_DO_LIMITE = "O saldo não pode passar de 999.999.999,999.";
    static final String MENSAGEM_CHAVE_COM_OUTROS_DADOS = "Esta operação já foi registrada com outros dados.";

    /** Maior valor de {@code NUMERIC(12,3)}: acima disso o banco recusaria com erro generico. */
    static final BigDecimal SALDO_MAXIMO = new BigDecimal("999999999.999");

    private static final String CONSTRAINT_DA_CHAVE = "uq_movimento_estoque_chave";

    private final ProdutoRepository produtoRepository;
    private final UsuarioRepository usuarioRepository;
    private final EstoqueSaldoRepository saldoRepository;
    private final MovimentoEstoqueRepository movimentoRepository;
    private final TransactionTemplate transacao;

    public EstoqueService(ProdutoRepository produtoRepository, UsuarioRepository usuarioRepository,
            EstoqueSaldoRepository saldoRepository, MovimentoEstoqueRepository movimentoRepository,
            PlatformTransactionManager gerenciadorDeTransacoes) {
        this.produtoRepository = produtoRepository;
        this.usuarioRepository = usuarioRepository;
        this.saldoRepository = saldoRepository;
        this.movimentoRepository = movimentoRepository;
        this.transacao = new TransactionTemplate(gerenciadorDeTransacoes);
    }

    /** Movimento da resposta e se foi gravado agora ({@code true}, 201) ou ja existia pela chave (200). */
    public record ResultadoAjuste(MovimentoEstoqueResponse movimento, boolean criado) {
    }

    // ---------- API publica (empresa sempre resolvida do usuario do JWT) ----------

    /**
     * Ajuste manual (spec 4.2 a 4.5), numa transacao propria. A mesma chave
     * na mesma empresa nao grava outro movimento: com os mesmos dados devolve o
     * gravado ({@code criado = false}); com outros, 409.
     *
     * <p>Dois pedidos simultaneos com a mesma chave no mesmo produto ficam em
     * fila na trava do produto, e o segundo encontra a chave na releitura. Em
     * produtos diferentes as travas nao se cruzam e a corrida chega a
     * {@code uq_movimento_estoque_chave}: a transacao perdedora e desfeita e uma
     * nova le o movimento que ganhou (Review Focus 3).
     */
    public ResultadoAjuste ajustarParaUsuario(Long idUsuario, UUID produtoId, AjusteEstoqueRequest request) {
        try {
            return transacao.execute(status -> ajustar(idUsuario, produtoId, request));
        } catch (DataIntegrityViolationException violacao) {
            if (!violouAChave(violacao)) {
                throw violacao;
            }
            return transacao.execute(status -> repeticao(resolverUsuario(idUsuario).getEmpresaId(), produtoId,
                    request).orElseThrow(() -> violacao));
        }
    }

    /**
     * Movimentos do produto, do mais recente para o mais antigo (spec 5).
     * Leitura para qualquer autenticado; mesmos limites de paginacao do
     * historico de precos; produto de outra empresa, 404. Com o controle
     * desligado, os movimentos guardados continuam aparecendo.
     */
    @Transactional(readOnly = true)
    public PaginaResponse<MovimentoEstoqueResponse> movimentosParaUsuario(Long idUsuario, UUID produtoId,
            int pagina, int tamanho) {
        Paginacao.validar(pagina, tamanho);
        Long empresaId = resolverUsuario(idUsuario).getEmpresaId();
        Produto produto = produtoRepository.findByUuidAndEmpresa_Id(produtoId, empresaId)
                .orElseThrow(ProdutoNaoEncontradoException::new);
        return PaginaResponse.de(movimentoRepository.movimentosDoProduto(empresaId, produto.getId(),
                PageRequest.of(pagina, tamanho)));
    }

    // ---------- Movimento (uso do pacote: ajuste manual e estoque inicial) ----------

    /**
     * Garante e trava a linha de saldo, calcula a variacao a partir do saldo
     * travado, aplica e grava o movimento. Exige uma transacao aberta e o
     * produto ja travado e validado por quem chama (controle ligado, motivo do
     * tipo, quantidade e fracao).
     *
     * @param quantidadeInformada a quantidade da entrada ou da saida (&gt; 0) ou,
     *        no ajuste, o saldo contado (&gt;= 0)
     */
    MovimentoEstoque registrarMovimento(Produto produto, TipoMovimento tipo, MotivoMovimento motivo,
            OrigemMovimento origem, BigDecimal quantidadeInformada, String observacao, Long usuarioId, UUID chave) {
        EstoqueSaldo saldo = travarSaldo(produto);
        BigDecimal anterior = saldo.getSaldo();
        BigDecimal variacao = variacao(tipo, emEscalaDeQuantidade(quantidadeInformada), anterior,
                produto.getUnidade().getSigla());
        BigDecimal novo = anterior.add(variacao);
        if (novo.compareTo(SALDO_MAXIMO) > 0) {
            throw new RegraDeNegocioException(MENSAGEM_SALDO_ACIMA_DO_LIMITE, CAMPO_QUANTIDADE);
        }
        saldo.aplicar(variacao);
        return movimentoRepository.save(new MovimentoEstoque(produto, tipo, motivo, origem, variacao, anterior, novo,
                observacao, usuarioId, chave));
    }

    // ---------- Ajuste manual ----------

    /** Ordem da spec: chave -> produto (trava, 404) -> chave de novo -> regras -> movimento. */
    private ResultadoAjuste ajustar(Long idUsuario, UUID produtoId, AjusteEstoqueRequest request) {
        Usuario usuario = resolverUsuario(idUsuario);
        Long empresaId = usuario.getEmpresaId();
        Optional<ResultadoAjuste> repetido = repeticao(empresaId, produtoId, request);
        if (repetido.isPresent()) {
            return repetido.get();
        }
        Produto produto = produtoRepository.buscarPorUuidParaAtualizar(produtoId, empresaId)
                .orElseThrow(ProdutoNaoEncontradoException::new);
        // Com a trava do produto, um pedido simultaneo com a mesma chave neste
        // produto ja confirmou: a releitura o encontra.
        repetido = repeticao(empresaId, produtoId, request);
        if (repetido.isPresent()) {
            return repetido.get();
        }
        validarAjusteManual(produto, request);
        MovimentoEstoque movimento = registrarMovimento(produto, request.tipo(), request.motivo(),
                OrigemMovimento.AJUSTE_MANUAL, request.quantidade(), normalizarOuNulo(request.observacao()),
                usuario.getId(), request.chave());
        return new ResultadoAjuste(MovimentoEstoqueResponse.de(movimento, usuario.getNome()), true);
    }

    private static void validarAjusteManual(Produto produto, AjusteEstoqueRequest request) {
        if (!produto.isControlaEstoque()) {
            throw new RegraDeNegocioException(MENSAGEM_SEM_CONTROLE);
        }
        validarMotivo(request.tipo(), request.motivo());
        if (request.motivo() == MotivoMovimento.OUTRO && !StringUtils.hasText(request.observacao())) {
            throw new RegraDeNegocioException(MENSAGEM_DESCREVA_O_MOTIVO, CAMPO_OBSERVACAO);
        }
        if (request.tipo() == TipoMovimento.AJUSTE) {
            QuantidadeDeEstoque.validarNaoNegativa(request.quantidade(), produto.getUnidade(), CAMPO_QUANTIDADE);
        } else {
            QuantidadeDeEstoque.validarPositiva(request.quantidade(), produto.getUnidade(), CAMPO_QUANTIDADE);
        }
    }

    private static void validarMotivo(TipoMovimento tipo, MotivoMovimento motivo) {
        if (!motivo.manual()) {
            throw new RegraDeNegocioException(MENSAGEM_MOTIVO_DO_SISTEMA, CAMPO_MOTIVO);
        }
        if (!motivo.aceitoNoAjusteManual(tipo)) {
            throw new RegraDeNegocioException(MENSAGEM_MOTIVO_DE_OUTRO_TIPO, CAMPO_MOTIVO);
        }
    }

    // ---------- Idempotencia (spec 4.5) ----------

    /** O movimento ja gravado com a chave, se houver; 409 se ele nao for este mesmo pedido. */
    private Optional<ResultadoAjuste> repeticao(Long empresaId, UUID produtoId, AjusteEstoqueRequest request) {
        return movimentoRepository.findByEmpresaIdAndChaveIdempotencia(empresaId, request.chave())
                .map(gravado -> {
                    if (!mesmoPedido(gravado, produtoId, request)) {
                        throw new ProdutoConflitoException(MENSAGEM_CHAVE_COM_OUTROS_DADOS);
                    }
                    return new ResultadoAjuste(
                            MovimentoEstoqueResponse.de(gravado, nomeDoUsuario(gravado.getUsuarioId())), false);
                });
    }

    private static boolean mesmoPedido(MovimentoEstoque gravado, UUID produtoId, AjusteEstoqueRequest request) {
        return gravado.getProduto().getUuid().equals(produtoId)
                && gravado.getTipo() == request.tipo()
                && gravado.getMotivo() == request.motivo()
                && gravado.quantidadeInformada().compareTo(request.quantidade()) == 0;
    }

    /** Se a violacao de integridade foi a da chave de idempotencia (e nao outra constraint). */
    private static boolean violouAChave(DataIntegrityViolationException violacao) {
        for (Throwable causa = violacao; causa != null; causa = causa.getCause()) {
            if (Objects.toString(causa.getMessage(), "").contains(CONSTRAINT_DA_CHAVE)) {
                return true;
            }
        }
        return false;
    }

    // ---------- Saldo ----------

    /**
     * {@code INSERT ... ON CONFLICT DO NOTHING} e depois {@code SELECT ... FOR
     * UPDATE}: o primeiro movimento do produto cria a linha sem erro mesmo com
     * outro pedido simultaneo (Review Focus 1).
     */
    private EstoqueSaldo travarSaldo(Produto produto) {
        saldoRepository.garantirLinha(produto.getEmpresaId(), produto.getId());
        return saldoRepository.buscarParaAtualizar(produto.getEmpresaId(), produto.getId())
                .orElseThrow(() -> new IllegalStateException("Linha de saldo ausente depois de garanti-la."));
    }

    /**
     * Variacao com sinal: {@code +q} na entrada, {@code -q} na saida (sem
     * passar do saldo) e {@code contado - saldo} no ajuste (que precisa mudar o
     * saldo).
     */
    private static BigDecimal variacao(TipoMovimento tipo, BigDecimal quantidade, BigDecimal saldo, String sigla) {
        return switch (tipo) {
            case ENTRADA -> quantidade;
            case SAIDA -> {
                if (quantidade.compareTo(saldo) > 0) {
                    throw new RegraDeNegocioException(MENSAGEM_SALDO_INSUFICIENTE.formatted(comSigla(saldo, sigla)),
                            CAMPO_QUANTIDADE);
                }
                yield quantidade.negate();
            }
            case AJUSTE -> {
                if (quantidade.compareTo(saldo) == 0) {
                    throw new RegraDeNegocioException(MENSAGEM_SALDO_IGUAL.formatted(comSigla(saldo, sigla)),
                            CAMPO_QUANTIDADE);
                }
                yield quantidade.subtract(saldo);
            }
        };
    }

    /** Quantidade na escala da coluna; ja validada com ate 3 casas, entao nunca arredonda. */
    private static BigDecimal emEscalaDeQuantidade(BigDecimal quantidade) {
        return quantidade.setScale(QuantidadeDeEstoque.CASAS_DECIMAIS, RoundingMode.UNNECESSARY);
    }

    /** "3 UN", "2,5 KG": sem zeros a direita e com virgula decimal. */
    private static String comSigla(BigDecimal quantidade, String sigla) {
        return quantidade.stripTrailingZeros().toPlainString().replace('.', ',') + " " + sigla;
    }

    // ---------- Apoio ----------

    private Usuario resolverUsuario(Long idUsuario) {
        return usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
    }

    private String nomeDoUsuario(Long usuarioId) {
        return usuarioRepository.findById(usuarioId).map(Usuario::getNome).orElse(null);
    }

    private static String normalizarOuNulo(String valor) {
        return StringUtils.hasText(valor) ? valor.trim() : null;
    }
}
