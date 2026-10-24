package com.geitus.app.inventory;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
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

import com.geitus.app.catalog.CatalogoNaoEncontradoException;
import com.geitus.app.catalog.CompraComCusto;
import com.geitus.app.catalog.CustoDeEntrada;
import com.geitus.app.catalog.FornecedorResumido;
import com.geitus.app.catalog.FornecedoresDoProduto;
import com.geitus.app.catalog.NomesDeFornecedores;
import com.geitus.app.catalog.Paginacao;
import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoConflitoException;
import com.geitus.app.catalog.ProdutoEmbalagem;
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
import com.geitus.app.inventory.dto.MovimentoEstoqueResponse.FornecedorDoMovimento;

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
 *
 * <p>Fase B3 (docs/modules/produtos-embalagens.md, 6): a entrada e a saida
 * podem ser informadas em embalagens do produto ({@code embalagemId}); o
 * movimento continua em unidades de venda e guarda o retrato da embalagem.
 *
 * <p>Fase B4 (docs/modules/produtos-custo-entrada.md, 2; DEC-038): a entrada
 * por compra exige o custo, gravado no movimento; o {@link CustoDeEntrada} do
 * catalogo o aplica no produto, na mesma transacao.
 *
 * <p>Fase B5 (docs/modules/fornecedores-e-marcas.md, 6; DEC-039): a entrada
 * por compra aceita o fornecedor (opcional, ativo, da empresa), gravado no
 * movimento; o {@link FornecedoresDoProduto} do catalogo o liga ao produto, se
 * faltar, e o marca como o da ultima compra, na mesma transacao.
 */
@Service
public class EstoqueService {

    static final String CAMPO_QUANTIDADE = "quantidade";
    static final String CAMPO_MOTIVO = "motivo";
    static final String CAMPO_OBSERVACAO = "observacao";
    static final String CAMPO_EMBALAGEM = "embalagemId";
    static final String CAMPO_CUSTO = "custo";
    static final String CAMPO_FORNECEDOR = "fornecedorId";

    static final String MENSAGEM_SEM_CONTROLE = "Este produto não controla estoque.";
    static final String MENSAGEM_MOTIVO_DO_SISTEMA = "Este motivo é registrado só pelo sistema.";
    static final String MENSAGEM_MOTIVO_DE_OUTRO_TIPO = "Este motivo não vale para o tipo de movimento escolhido.";
    static final String MENSAGEM_DESCREVA_O_MOTIVO = "Descreva o motivo.";
    static final String MENSAGEM_SALDO_INSUFICIENTE = "Saldo insuficiente: há %s.";
    static final String MENSAGEM_SALDO_IGUAL = "O saldo já é %s.";
    static final String MENSAGEM_SALDO_ACIMA_DO_LIMITE = "O saldo não pode passar de 999.999.999,999.";
    static final String MENSAGEM_CHAVE_COM_OUTROS_DADOS = "Esta operação já foi registrada com outros dados.";
    static final String MENSAGEM_CONTAGEM_EM_EMBALAGEM = "A contagem é feita na unidade de venda.";
    static final String MENSAGEM_EMBALAGEM_NAO_ENCONTRADA = "Embalagem não encontrada.";
    static final String MENSAGEM_EMBALAGENS_INTEIRAS = "Informe um número inteiro de embalagens.";
    static final String MENSAGEM_CUSTO_FORA_DA_COMPRA = "O custo só é informado na entrada por compra.";
    static final String MENSAGEM_INFORME_O_CUSTO = "Informe o custo da compra.";
    static final String MENSAGEM_CUSTO_NAO_POSITIVO = "O custo deve ser maior que zero.";
    static final String MENSAGEM_FORNECEDOR_FORA_DA_COMPRA = "O fornecedor só é informado na entrada por compra.";
    static final String MENSAGEM_FORNECEDOR_NAO_ENCONTRADO = "Fornecedor não encontrado.";
    static final String MENSAGEM_FORNECEDOR_INATIVO = "Este fornecedor está inativo.";

    /** Maior valor de {@code NUMERIC(12,3)}: acima disso o banco recusaria com erro generico. */
    static final BigDecimal SALDO_MAXIMO = QuantidadeDeEstoque.MAXIMO;

    private static final String CONSTRAINT_DA_CHAVE = "uq_movimento_estoque_chave";

    private final ProdutoRepository produtoRepository;
    private final UsuarioRepository usuarioRepository;
    private final EstoqueSaldoRepository saldoRepository;
    private final MovimentoEstoqueRepository movimentoRepository;
    private final CustoDeEntrada custoDeEntrada;
    private final NomesDeFornecedores nomesDeFornecedores;
    private final FornecedoresDoProduto fornecedoresDoProduto;
    private final TransactionTemplate transacao;

    public EstoqueService(ProdutoRepository produtoRepository, UsuarioRepository usuarioRepository,
            EstoqueSaldoRepository saldoRepository, MovimentoEstoqueRepository movimentoRepository,
            CustoDeEntrada custoDeEntrada, NomesDeFornecedores nomesDeFornecedores,
            FornecedoresDoProduto fornecedoresDoProduto, PlatformTransactionManager gerenciadorDeTransacoes) {
        this.produtoRepository = produtoRepository;
        this.usuarioRepository = usuarioRepository;
        this.saldoRepository = saldoRepository;
        this.movimentoRepository = movimentoRepository;
        this.custoDeEntrada = custoDeEntrada;
        this.nomesDeFornecedores = nomesDeFornecedores;
        this.fornecedoresDoProduto = fornecedoresDoProduto;
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
        return registrarMovimento(produto, tipo, motivo, origem,
                new ValoresDoMovimento(new QuantidadeDoAjuste(quantidadeInformada, null), null, null), observacao,
                usuarioId, chave);
    }

    /** Quantidade do ajuste em unidades de venda e, se informada em embalagens, o retrato da embalagem. */
    record QuantidadeDoAjuste(BigDecimal emUnidades, RetratoDaEmbalagem embalagem) {
    }

    /**
     * Quantidade validada e, so na entrada por compra, o custo (Fase B4) e o
     * fornecedor (Fase B5, opcional); {@code null} nos demais.
     */
    record ValoresDoMovimento(QuantidadeDoAjuste quantidade, CustoDaCompra custo, FornecedorResumido fornecedor) {

        ValoresDoMovimento comFornecedor(FornecedorResumido fornecedorDaCompra) {
            return new ValoresDoMovimento(quantidade, custo, fornecedorDaCompra);
        }

        Long fornecedorId() {
            return fornecedor == null ? null : fornecedor.id();
        }
    }

    private MovimentoEstoque registrarMovimento(Produto produto, TipoMovimento tipo, MotivoMovimento motivo,
            OrigemMovimento origem, ValoresDoMovimento valores, String observacao, Long usuarioId, UUID chave) {
        QuantidadeDoAjuste quantidade = valores.quantidade();
        BigDecimal quantidadeInformada = quantidade.emUnidades();
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
                observacao, usuarioId, chave, quantidade.embalagem(), valores.custo(), valores.fornecedorId()));
    }

    // ---------- Ajuste manual ----------

    /**
     * Ordem da spec: chave -> produto (trava, 404) -> chave de novo -> regras ->
     * fornecedor (Fase B5) -> movimento -> custo do produto (Fase B4) ->
     * fornecedor do produto (Fase B5). A chave repetida devolve o movimento
     * gravado antes de procurar a embalagem, que pode ter saido do produto
     * depois (Review Focus 5 da B3), e sem tocar no custo nem nos fornecedores
     * do produto (Review Focus 5 da B5: uma ligacao so).
     */
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
        ValoresDoMovimento valores = validarAjusteManual(produto, request)
                .comFornecedor(fornecedorDaCompra(empresaId, request));
        MovimentoEstoque movimento = registrarMovimento(produto, request.tipo(), request.motivo(),
                OrigemMovimento.AJUSTE_MANUAL, valores, normalizarOuNulo(request.observacao()),
                usuario.getId(), request.chave());
        if (valores.custo() != null) {
            // IDENTITY: o save ja inseriu o movimento (@PrePersist rodou), entao o id e o criadoEm existem.
            custoDeEntrada.registrar(produto, new CompraComCusto(movimento.getId(), valores.custo().porUnidade(),
                    movimento.getCriadoEm()), usuario.getId());
        }
        if (valores.fornecedor() != null) {
            fornecedoresDoProduto.registrarCompra(produto, valores.fornecedorId());
        }
        return new ResultadoAjuste(MovimentoEstoqueResponse.de(movimento, usuario.getNome(),
                fornecedorDoMovimento(valores.fornecedor())), true);
    }

    /**
     * Fornecedor da compra (spec 6), depois das regras da B4, nesta ordem: so
     * na entrada por compra (400), da empresa (404, DEC-016) e ativo (400).
     * {@code null} sem fornecedor.
     */
    private FornecedorResumido fornecedorDaCompra(Long empresaId, AjusteEstoqueRequest request) {
        if (request.fornecedorId() == null) {
            return null;
        }
        if (!entradaPorCompra(request)) {
            throw new RegraDeNegocioException(MENSAGEM_FORNECEDOR_FORA_DA_COMPRA, CAMPO_FORNECEDOR);
        }
        FornecedorResumido fornecedor = nomesDeFornecedores.porUuids(empresaId, List.of(request.fornecedorId()))
                .get(request.fornecedorId());
        if (fornecedor == null) {
            throw new CatalogoNaoEncontradoException(MENSAGEM_FORNECEDOR_NAO_ENCONTRADO);
        }
        if (!fornecedor.ativo()) {
            throw new RegraDeNegocioException(MENSAGEM_FORNECEDOR_INATIVO, CAMPO_FORNECEDOR);
        }
        return fornecedor;
    }

    private static boolean entradaPorCompra(AjusteEstoqueRequest request) {
        return request.tipo() == TipoMovimento.ENTRADA && request.motivo() == MotivoMovimento.COMPRA;
    }

    private static FornecedorDoMovimento fornecedorDoMovimento(FornecedorResumido fornecedor) {
        return fornecedor == null ? null : new FornecedorDoMovimento(fornecedor.uuid(), fornecedor.nome());
    }

    /**
     * Regras do ajuste manual, nesta ordem: controle de estoque, motivo,
     * observacao em "Outro", quantidade (em unidades ou em embalagens) e, por
     * ultimo, o custo (Fase B4).
     */
    private static ValoresDoMovimento validarAjusteManual(Produto produto, AjusteEstoqueRequest request) {
        if (!produto.isControlaEstoque()) {
            throw new RegraDeNegocioException(MENSAGEM_SEM_CONTROLE);
        }
        validarMotivo(request.tipo(), request.motivo());
        if (request.motivo() == MotivoMovimento.OUTRO && !StringUtils.hasText(request.observacao())) {
            throw new RegraDeNegocioException(MENSAGEM_DESCREVA_O_MOTIVO, CAMPO_OBSERVACAO);
        }
        QuantidadeDoAjuste quantidade = request.embalagemId() != null
                ? emEmbalagens(produto, request)
                : emUnidades(produto, request);
        return new ValoresDoMovimento(quantidade, custoDaCompra(request, quantidade.embalagem()), null);
    }

    private static QuantidadeDoAjuste emUnidades(Produto produto, AjusteEstoqueRequest request) {
        if (request.tipo() == TipoMovimento.AJUSTE) {
            QuantidadeDeEstoque.validarNaoNegativa(request.quantidade(), produto.getUnidade(), CAMPO_QUANTIDADE);
        } else {
            QuantidadeDeEstoque.validarPositiva(request.quantidade(), produto.getUnidade(), CAMPO_QUANTIDADE);
        }
        return new QuantidadeDoAjuste(request.quantidade(), null);
    }

    /**
     * Ajuste informado em embalagens, nesta ordem: so entrada e saida (400 no
     * {@code embalagemId}), embalagem deste produto (404, DEC-016), numero de
     * embalagens inteiro e maior que zero (400); o total em unidades (embalagens
     * x unidades por embalagem) segue as regras da Fase D (limite e fracao; o
     * saldo e conferido ao registrar).
     */
    private static QuantidadeDoAjuste emEmbalagens(Produto produto, AjusteEstoqueRequest request) {
        if (request.tipo() == TipoMovimento.AJUSTE) {
            throw new RegraDeNegocioException(MENSAGEM_CONTAGEM_EM_EMBALAGEM, CAMPO_EMBALAGEM);
        }
        ProdutoEmbalagem embalagem = produto.embalagem(request.embalagemId())
                .orElseThrow(() -> new CatalogoNaoEncontradoException(MENSAGEM_EMBALAGEM_NAO_ENCONTRADA));
        BigDecimal embalagens = request.quantidade();
        if (embalagens.signum() <= 0 || embalagens.stripTrailingZeros().scale() > 0) {
            throw new RegraDeNegocioException(MENSAGEM_EMBALAGENS_INTEIRAS, CAMPO_QUANTIDADE);
        }
        BigDecimal total = embalagens.multiply(embalagem.getQuantidade());
        QuantidadeDeEstoque.validarPositiva(total, produto.getUnidade(), CAMPO_QUANTIDADE);
        return new QuantidadeDoAjuste(total, new RetratoDaEmbalagem(embalagem.rotulo(), embalagem.getQuantidade(),
                embalagens.intValueExact()));
    }

    /**
     * Custo da compra (spec 2.1 e 2.3), nesta ordem: so na entrada por compra
     * (400 nos demais), obrigatorio nela (400) e maior que zero, no digitado e
     * no custo que o produto recebe, em centavos (400). {@code null} fora da
     * entrada por compra.
     */
    private static CustoDaCompra custoDaCompra(AjusteEstoqueRequest request, RetratoDaEmbalagem embalagem) {
        if (!entradaPorCompra(request)) {
            if (request.custo() != null) {
                throw new RegraDeNegocioException(MENSAGEM_CUSTO_FORA_DA_COMPRA, CAMPO_CUSTO);
            }
            return null;
        }
        if (request.custo() == null) {
            throw new RegraDeNegocioException(MENSAGEM_INFORME_O_CUSTO, CAMPO_CUSTO);
        }
        CustoDaCompra custo = CustoDaCompra.de(request.custo(), embalagem);
        if (!custo.positivo()) {
            throw new RegraDeNegocioException(MENSAGEM_CUSTO_NAO_POSITIVO, CAMPO_CUSTO);
        }
        return custo;
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
                    FornecedorResumido fornecedor = fornecedorGravado(empresaId, gravado);
                    if (!mesmoPedido(gravado, produtoId, request) || !mesmoFornecedor(fornecedor, request)) {
                        throw new ProdutoConflitoException(MENSAGEM_CHAVE_COM_OUTROS_DADOS);
                    }
                    return new ResultadoAjuste(MovimentoEstoqueResponse.de(gravado,
                            nomeDoUsuario(gravado.getUsuarioId()), fornecedorDoMovimento(fornecedor)), false);
                });
    }

    private FornecedorResumido fornecedorGravado(Long empresaId, MovimentoEstoque gravado) {
        if (gravado.getFornecedorId() == null) {
            return null;
        }
        Long fornecedorId = gravado.getFornecedorId();
        return nomesDeFornecedores.porIds(empresaId, List.of(fornecedorId)).get(fornecedorId);
    }

    /** Fase B5 (Review Focus 5): a mesma chave com outro fornecedor (ou com e sem) e outro pedido. */
    private static boolean mesmoFornecedor(FornecedorResumido gravado, AjusteEstoqueRequest request) {
        UUID doPedido = request.fornecedorId();
        return gravado == null ? doPedido == null : gravado.uuid().equals(doPedido);
    }

    /**
     * Mesmo produto, tipo, motivo, quantidade informada, observacao (aparada;
     * vazia = sem) e custo (Fase B4: 10 = 10,00; sem custo = sem custo).
     */
    private static boolean mesmoPedido(MovimentoEstoque gravado, UUID produtoId, AjusteEstoqueRequest request) {
        return gravado.getProduto().getUuid().equals(produtoId)
                && gravado.getTipo() == request.tipo()
                && gravado.getMotivo() == request.motivo()
                && mesmaQuantidade(gravado, request)
                && Objects.equals(gravado.getObservacao(), normalizarOuNulo(request.observacao()))
                && mesmoCusto(gravado.getCustoInformado(), request.custo());
    }

    private static boolean mesmoCusto(BigDecimal gravado, BigDecimal pedido) {
        if (gravado == null || pedido == null) {
            return gravado == pedido;
        }
        return gravado.compareTo(pedido) == 0;
    }

    /**
     * Em unidades, a quantidade informada; em embalagens, o numero de
     * embalagens do retrato e, se a embalagem do pedido ainda existe no
     * produto, o mesmo rotulo e o mesmo conteudo (uma chave reaproveitada com
     * outra embalagem e outro pedido). O movimento nao guarda o id da
     * embalagem: se ela ja saiu do produto, a repeticao e reconhecida pelo
     * retrato (Review Focus 5 da B3).
     */
    private static boolean mesmaQuantidade(MovimentoEstoque gravado, AjusteEstoqueRequest request) {
        Optional<RetratoDaEmbalagem> retrato = gravado.getRetratoDaEmbalagem();
        if (request.embalagemId() == null) {
            return retrato.isEmpty() && gravado.quantidadeInformada().compareTo(request.quantidade()) == 0;
        }
        return retrato.isPresent()
                && BigDecimal.valueOf(retrato.get().quantidadeDeEmbalagens()).compareTo(request.quantidade()) == 0
                && gravado.getProduto().embalagem(request.embalagemId())
                        .map(atual -> mesmaEmbalagem(retrato.get(), atual))
                        .orElse(true);
    }

    private static boolean mesmaEmbalagem(RetratoDaEmbalagem retrato, ProdutoEmbalagem atual) {
        return retrato.rotulo().equals(atual.rotulo())
                && retrato.quantidadePorEmbalagem().compareTo(atual.getQuantidade()) == 0;
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
     * UPDATE}. Quem chama ja travou o produto, o que poe em fila os movimentos
     * dele; este passo e a segunda defesa: o primeiro movimento cria a linha sem
     * erro mesmo num caminho que nao trave o produto (Review Focus 1).
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
