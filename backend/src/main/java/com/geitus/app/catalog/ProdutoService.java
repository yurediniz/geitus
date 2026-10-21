package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.categoria.CategoriaService;
import com.geitus.app.catalog.dto.AtacadoRequest;
import com.geitus.app.catalog.dto.HistoricoPrecoResponse;
import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.catalog.dto.ProdutoRequest;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.dto.PromocaoRequest;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.shared.busca.PadraoLike;

/**
 * Regras de negocio do modulo Produtos.
 *
 * <p>Toda a regra de negocio fica concentrada aqui (arquitetura por camadas do
 * CLAUDE.md), consumida por um controller fino ({@code ProdutoController}).
 *
 * <p>O {@code empresaId} recebido pelos metodos internos representa SEMPRE a
 * empresa do usuario autenticado (nunca uma escolha livre do chamador) e e
 * usado para isolar consultas e alteracoes por tenant (DEC-016): um produto de
 * outra empresa nunca deve ser encontrado, atualizado, excluido ou vazado —
 * inclusive pelo nome, na mensagem de codigo de barras duplicado. O mesmo vale
 * para a unidade, a categoria e a unidade de compra informadas: sao buscadas
 * dentro da empresa e, se forem de outra, respondem 404.
 *
 * <p>A API publica do service e composta apenas pelos metodos {@code *ParaUsuario},
 * que recebem {@code idUsuario} (o id extraido do JWT) e resolvem a empresa
 * internamente, no mesmo padrao usado em {@code EmpresaService.buscarUsuarioAtivo}:
 * assim o controller nunca manipula {@code empresaId} diretamente. O produto e
 * identificado pelo UUID publico (DEC-019). Os metodos que recebem
 * {@code empresaId} sao de uso interno (package-private) e concentram a regra
 * de isolamento por tenant.
 *
 * <p>Fase B (docs/modules/produtos-identificacao-e-formulario.md, secao 4):
 * codigos de barras multiplos, nome curto, fornecedor, SKU sugerido, sugestoes
 * de marca/fornecedor e exclusao fisica condicionada a {@link #podeExcluir}.
 *
 * <p>Fase C (docs/modules/produtos-precos.md, 4.3 e 4.4): promocao e atacado
 * validados contra o preco de venda, o preco minimo e a unidade de venda; a
 * situacao da promocao usa a data do {@link Clock} da aplicacao
 * ({@code America/Sao_Paulo}), lida uma vez por requisicao. O historico de
 * custo e preco de venda (4.6) e gravado na mesma transacao do produto, com o
 * usuario autenticado, so para o que realmente mudou.
 */
@Service
public class ProdutoService {

    static final String MENSAGEM_UNIDADE_OBRIGATORIA = "Unidade é obrigatória.";
    static final String MENSAGEM_COMPRA_E_FATOR_JUNTOS = "Informe a unidade de compra e o fator de conversão juntos.";
    static final String MENSAGEM_FATOR_DA_MESMA_UNIDADE =
            "Quando a unidade de compra é a mesma de venda, o fator deve ser 1.";
    static final String MENSAGEM_FATOR_NAO_POSITIVO = "O fator de conversão deve ser maior que zero.";
    static final String MENSAGEM_UNIDADE_INATIVA = "Esta unidade está inativa. Escolha uma unidade ativa.";
    static final String MENSAGEM_UNIDADE_COMPRA_INATIVA =
            "Esta unidade de compra está inativa. Escolha uma unidade ativa.";
    static final String MENSAGEM_CATEGORIA_INATIVA = "Esta categoria está inativa. Escolha uma categoria ativa.";
    static final String MENSAGEM_SKU_DUPLICADO = "Já existe um produto com este SKU nesta empresa.";

    static final String MENSAGEM_CODIGO_REPETIDO = "Código de barras repetido na lista.";
    static final String MENSAGEM_LIMITE_DE_CODIGOS = "Informe no máximo 20 códigos de barras.";
    static final String MENSAGEM_CODIGO_LONGO = "Código de barras deve ter no máximo 50 caracteres.";
    static final String MENSAGEM_DIGITO_INVALIDO = "Código de barras %s com dígito verificador inválido. "
            + "Confira a leitura.";
    static final String MENSAGEM_CODIGO_EM_OUTRO_PRODUTO = "O código de barras %s já está cadastrado no produto \"%s\".";
    static final String MENSAGEM_EXCLUSAO_BLOQUEADA = "Este produto já teve movimentação e não pode ser excluído. "
            + "Inative-o para que não apareça na venda.";
    static final String MENSAGEM_CAMPO_DE_SUGESTAO_INVALIDO = "Campo de sugestão inválido.";

    static final String MENSAGEM_PRECO_PROMOCIONAL_OBRIGATORIO = "Informe o preço promocional.";
    static final String MENSAGEM_INICIO_PROMOCAO_OBRIGATORIO = "Informe o início da promoção.";
    static final String MENSAGEM_FIM_PROMOCAO_OBRIGATORIO = "Informe o fim da promoção.";
    static final String MENSAGEM_FIM_ANTES_DO_INICIO = "O fim da promoção não pode ser antes do início.";
    static final String MENSAGEM_PRECO_ATACADO_OBRIGATORIO = "Informe o preço de atacado.";
    static final String MENSAGEM_QUANTIDADE_ATACADO_OBRIGATORIA = "Informe a quantidade mínima do atacado.";
    static final String MENSAGEM_QUANTIDADE_ATACADO_ATE_UM = "A quantidade mínima do atacado deve ser maior que 1.";
    static final String MENSAGEM_QUANTIDADE_ATACADO_CASAS =
            "A quantidade mínima do atacado deve ter no máximo 3 casas decimais.";
    static final String MENSAGEM_UNIDADE_NAO_FRACIONADA = "A unidade %s não aceita quantidade fracionada.";
    static final String MENSAGEM_PAGINA_NEGATIVA = "A página deve ser maior ou igual a zero.";
    static final String MENSAGEM_TAMANHO_DE_PAGINA_INVALIDO = "O tamanho da página deve ser entre 1 e 100.";

    /** Campos do {@code ProdutoRequest} devolvidos em {@code campos} nos erros de regra (contrato aditivo). */
    static final String CAMPO_SKU = "sku";
    static final String CAMPO_CODIGOS_BARRAS = "codigosBarras";
    static final String CAMPO_PROMOCAO_PRECO = "promocao.preco";
    static final String CAMPO_PROMOCAO_INICIO = "promocao.inicio";
    static final String CAMPO_PROMOCAO_FIM = "promocao.fim";
    static final String CAMPO_ATACADO_PRECO = "atacado.preco";
    static final String CAMPO_ATACADO_QUANTIDADE_MINIMA = "atacado.quantidadeMinima";

    static final int MAXIMO_CODIGOS_POR_PRODUTO = 20;
    static final int TAMANHO_MAXIMO_CODIGO = 50;
    static final int LIMITE_DE_SUGESTOES = 10;
    static final int TAMANHO_MAXIMO_TERMO_DE_SUGESTAO = 50;
    /** Casas decimais da quantidade minima do atacado ({@code NUMERIC(12,3)}, V8). */
    static final int CASAS_QUANTIDADE_ATACADO = 3;
    static final int TAMANHO_MAXIMO_PAGINA_HISTORICO = 100;

    /** SKU no padrao da sugestao automatica: {@code P} + 6 ou mais digitos (spec 4.2). */
    private static final Pattern SKU_NO_PADRAO = Pattern.compile("P([0-9]{6,})");
    private static final String PREFIXO_SKU_SUGERIDO = "P";
    private static final String FORMATO_NUMERO_SKU_SUGERIDO = "%06d";

    private static final Logger LOG = LoggerFactory.getLogger(ProdutoService.class);

    private final ProdutoRepository produtoRepository;
    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;
    private final UnidadeMedidaService unidadeService;
    private final CategoriaService categoriaService;
    private final HistoricoPrecoRepository historicoPrecoRepository;
    private final Clock relogio;

    public ProdutoService(ProdutoRepository produtoRepository, EmpresaRepository empresaRepository,
            UsuarioRepository usuarioRepository, UnidadeMedidaService unidadeService,
            CategoriaService categoriaService, HistoricoPrecoRepository historicoPrecoRepository, Clock relogio) {
        this.produtoRepository = produtoRepository;
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
        this.unidadeService = unidadeService;
        this.categoriaService = categoriaService;
        this.historicoPrecoRepository = historicoPrecoRepository;
        this.relogio = relogio;
    }

    /**
     * Cadastra o produto e registra no historico o preco de venda e o custo
     * iniciais (valor anterior nulo), atribuidos a {@code idUsuario}.
     */
    Produto cadastrar(Long idUsuario, Long empresaId, ProdutoRequest request) {
        validarCampos(request);
        List<CodigoBarrasValidado> codigos = validarCodigos(empresaId, request.codigosBarras(), null);
        String sku = normalizarOuNulo(request.sku());
        garantirSkuDisponivelParaNovoProduto(empresaId, sku);
        Vinculos vinculos = resolverVinculos(empresaId, request, null);
        validarPromocaoEAtacado(request, vinculos.unidade());

        Empresa empresa = empresaRepository.findById(empresaId)
                .orElseThrow(() -> new RegraDeNegocioException("Empresa informada não encontrada."));

        Produto produto = new Produto(empresa, dadosDoProduto(request, vinculos, sku));
        produto.substituirCodigos(codigos);
        Produto gravado = produtoRepository.save(produto);
        registrarHistorico(gravado, idUsuario, null, null);
        return gravado;
    }

    /**
     * Atualiza o cadastro. {@code codigosBarras} {@code null} (campo ausente no
     * PATCH) mantem os codigos atuais, sem validar nem tocar na lista; uma
     * lista — inclusive {@code []}, que remove todos — substitui a lista inteira.
     * Mudancas de custo e preco de venda vao para o historico com {@code idUsuario}.
     */
    Produto atualizarDadosBasicos(Long idUsuario, Long empresaId, UUID produtoId, ProdutoRequest request) {
        Produto produto = buscarPorId(empresaId, produtoId);

        validarCampos(request);
        Optional<List<CodigoBarrasValidado>> codigos = Optional.ofNullable(request.codigosBarras())
                .map(informados -> validarCodigos(empresaId, informados, produto));
        String sku = normalizarOuNulo(request.sku());
        garantirSkuDisponivelParaProdutoExistente(empresaId, produto.getId(), sku);
        Vinculos vinculos = resolverVinculos(empresaId, request, produto);
        validarPromocaoEAtacado(request, vinculos.unidade());

        BigDecimal custoAnterior = produto.getCusto();
        BigDecimal precoAnterior = produto.getPrecoVenda();
        produto.atualizarDadosBasicos(dadosDoProduto(request, vinculos, sku));
        codigos.ifPresent(produto::substituirCodigos);
        Produto gravado = produtoRepository.save(produto);
        registrarHistorico(gravado, idUsuario, custoAnterior, precoAnterior);
        return gravado;
    }

    Produto inativar(Long empresaId, UUID produtoId) {
        Produto produto = buscarPorId(empresaId, produtoId);
        produto.inativar();
        return produtoRepository.save(produto);
    }

    Produto reativar(Long empresaId, UUID produtoId) {
        Produto produto = buscarPorId(empresaId, produtoId);
        produto.ativar();
        return produtoRepository.save(produto);
    }

    /**
     * Exclusao fisica (spec 4.5, DEC-030): so se {@link #podeExcluir}; senao 409.
     * Os codigos de barras saem junto (cascade na entidade e no banco).
     *
     * <p><b>Rastro provisorio</b> ate existir a auditoria (divida tecnica): log
     * {@code INFO} so com identificadores — usuario, empresa e UUID publico do
     * produto —, nunca nome, SKU ou outro dado do cadastro. O {@code flush}
     * executa o {@code DELETE} antes do log, para o rastro so ser registrado
     * depois de o banco aceitar a exclusao.
     */
    void excluir(Long idUsuario, Long empresaId, UUID produtoId) {
        Produto produto = buscarPorId(empresaId, produtoId);
        if (!podeExcluir(produto)) {
            throw new ProdutoConflitoException(MENSAGEM_EXCLUSAO_BLOQUEADA);
        }
        produtoRepository.delete(produto);
        produtoRepository.flush();
        LOG.info("Produto excluido: usuario={} empresa={} produto={}", idUsuario, empresaId, produtoId);
    }

    /**
     * Se o produto pode ser excluido fisicamente: so quando nunca teve venda
     * nem movimentacao de estoque (DEC-030).
     *
     * <p><b>Ponto de extensao das Fases C/D:</b> nesta fase ainda nao existem
     * vendas nem movimentacoes, entao todo produto pode ser excluido. Quando
     * esses modulos existirem, a verificacao entra AQUI (e so aqui): ela
     * decide tanto o {@code DELETE} quanto o {@code podeExcluir} da resposta.
     * Package-private e nao final para os testes simularem o bloqueio.
     */
    boolean podeExcluir(Produto produto) {
        return true;
    }

    Produto buscarPorId(Long empresaId, UUID produtoId) {
        return produtoRepository.findByUuidAndEmpresa_Id(produtoId, empresaId)
                .orElseThrow(ProdutoNaoEncontradoException::new);
    }

    /**
     * Lista com filtros. Com termo, casa nome, nome curto e SKU pelo termo e
     * os codigos de barras pelo termo sem espacos; {@code %} e {@code _} do
     * termo sao literais (DT-017). Sem termo, usa a query sem padroes (ver nota
     * no {@link ProdutoRepository}).
     *
     * <p>"Sem termo" e decidido pelo termo de codigo, que remove TODO espaco
     * Unicode — inclusive os nao separaveis (U+00A0, U+2007, U+202F), que
     * {@code StringUtils.hasText} e {@code trim} nao tratam como espaco. Se
     * nao sobra nada, e listagem sem busca; se sobra, o termo de texto tambem
     * tem conteudo.
     */
    List<Produto> listarPorEmpresaComFiltros(Long empresaId, String busca, Boolean ativo) {
        String termoDeCodigo = CodigoBarras.normalizar(busca);
        if (termoDeCodigo == null) {
            return produtoRepository.buscarPorEmpresa(empresaId, ativo);
        }
        String padraoTexto = PadraoLike.contem(emMinusculas(busca.trim()));
        String padraoCodigo = PadraoLike.contem(emMinusculas(termoDeCodigo));
        return produtoRepository.buscarPorEmpresaComBusca(empresaId, padraoTexto, padraoCodigo, ativo);
    }

    /**
     * Proximo SKU no padrao {@code P} + 6 digitos (spec 4.2): o maior numero
     * entre os SKUs da empresa que seguem exatamente o padrao, mais 1. SKUs
     * fora do padrao sao ignorados; passando de 999999 o numero cresce. Nao
     * reserva: a unicidade e conferida ao salvar.
     */
    String sugerirSku(Long empresaId) {
        BigInteger maiorNumero = produtoRepository.skusNoPadrao(empresaId).stream()
                .map(SKU_NO_PADRAO::matcher)
                .filter(Matcher::matches)
                .map(numero -> new BigInteger(numero.group(1)))
                .max(Comparator.naturalOrder())
                .orElse(BigInteger.ZERO);
        return PREFIXO_SKU_SUGERIDO
                + String.format(Locale.ROOT, FORMATO_NUMERO_SKU_SUGERIDO, maiorNumero.add(BigInteger.ONE));
    }

    /**
     * Ate {@value #LIMITE_DE_SUGESTOES} valores distintos de marca ou fornecedor
     * ja usados na empresa que contem o termo (spec 4.4). {@code campo} vem de
     * uma allow-list (400 fora dela); o termo e aparado e limitado aos
     * {@value #TAMANHO_MAXIMO_TERMO_DE_SUGESTAO} primeiros caracteres; sem
     * termo, os mais usados.
     */
    List<String> sugestoes(Long empresaId, String campo, String termo) {
        CampoDeSugestao campoDeSugestao = CampoDeSugestao.de(campo);
        String padrao = PadraoLike.contem(emMinusculas(termoDeSugestao(termo)));
        return switch (campoDeSugestao) {
            case MARCA -> produtoRepository.sugestoesDeMarca(empresaId, padrao, LIMITE_DE_SUGESTOES);
            case FORNECEDOR -> produtoRepository.sugestoesDeFornecedor(empresaId, padrao, LIMITE_DE_SUGESTOES);
        };
    }

    // ---------- API publica (empresa sempre resolvida do usuario do JWT) ----------

    @Transactional
    public ProdutoResponse cadastrarParaUsuario(Long idUsuario, ProdutoRequest request) {
        return responder(cadastrar(idUsuario, resolverEmpresaId(idUsuario), request));
    }

    @Transactional
    public ProdutoResponse atualizarDadosBasicosParaUsuario(Long idUsuario, UUID produtoId, ProdutoRequest request) {
        return responderAposGravar(atualizarDadosBasicos(idUsuario, resolverEmpresaId(idUsuario), produtoId,
                request));
    }

    @Transactional
    public ProdutoResponse inativarParaUsuario(Long idUsuario, UUID produtoId) {
        return responderAposGravar(inativar(resolverEmpresaId(idUsuario), produtoId));
    }

    @Transactional
    public ProdutoResponse reativarParaUsuario(Long idUsuario, UUID produtoId) {
        return responderAposGravar(reativar(resolverEmpresaId(idUsuario), produtoId));
    }

    @Transactional
    public void excluirParaUsuario(Long idUsuario, UUID produtoId) {
        excluir(idUsuario, resolverEmpresaId(idUsuario), produtoId);
    }

    @Transactional(readOnly = true)
    public ProdutoResponse buscarPorIdParaUsuario(Long idUsuario, UUID produtoId) {
        return responder(buscarPorId(resolverEmpresaId(idUsuario), produtoId));
    }

    /** Lista com filtros; a arvore de categorias e montada uma unica vez para todos os produtos. */
    @Transactional(readOnly = true)
    public List<ProdutoResponse> listarParaUsuario(Long idUsuario, String busca, Boolean ativo) {
        Long empresaId = resolverEmpresaId(idUsuario);
        List<Produto> produtos = listarPorEmpresaComFiltros(empresaId, busca, ativo);
        CategoriaArvore arvore = categoriaService.arvoreDaEmpresa(empresaId);
        LocalDate hoje = SituacaoPromocao.hoje(relogio);
        return produtos.stream()
                .map(produto -> ProdutoResponse.de(produto, arvore, podeExcluir(produto), hoje))
                .toList();
    }

    /**
     * Historico de custo e preco de venda do produto, do mais recente para o
     * mais antigo (spec 5). Leitura para qualquer autenticado; produto de
     * outra empresa responde 404 (DEC-016); pagina ou tamanho fora dos
     * limites, 400.
     */
    @Transactional(readOnly = true)
    public PaginaResponse<HistoricoPrecoResponse> historicoDePrecosParaUsuario(Long idUsuario, UUID produtoId,
            int pagina, int tamanho) {
        validarPaginacao(pagina, tamanho);
        Long empresaId = resolverEmpresaId(idUsuario);
        Produto produto = buscarPorId(empresaId, produtoId);
        return PaginaResponse.de(historicoPrecoRepository.historicoDoProduto(empresaId, produto.getId(),
                PageRequest.of(pagina, tamanho)));
    }

    @Transactional(readOnly = true)
    public String sugerirSkuParaUsuario(Long idUsuario) {
        return sugerirSku(resolverEmpresaId(idUsuario));
    }

    @Transactional(readOnly = true)
    public List<String> sugestoesParaUsuario(Long idUsuario, String campo, String termo) {
        return sugestoes(resolverEmpresaId(idUsuario), campo, termo);
    }

    // ---------- Codigos de barras (spec 4.3) ----------

    /**
     * Valida a lista de codigos, nesta ordem: normaliza (descartando vazios) →
     * repetidos no envio (400) → mais de 20 (400) → para cada codigo: se o
     * produto ja o tem com o mesmo texto, mantem o formato gravado (inclusive
     * {@code OUTRO} de um EAN com digito errado vindo da migracao — Review
     * Focus 1); senao detecta o formato, rejeita candidato GS1 com digito
     * invalido (400) e confere a unicidade na empresa (409 com o nome do
     * produto da MESMA empresa — Review Focus 3). {@code produtoAtual} e
     * {@code null} no cadastro.
     */
    private List<CodigoBarrasValidado> validarCodigos(Long empresaId, List<String> informados, Produto produtoAtual) {
        List<String> codigos = normalizarCodigos(informados);
        exigirSemRepetidos(codigos);
        if (codigos.size() > MAXIMO_CODIGOS_POR_PRODUTO) {
            throw new RegraDeNegocioException(MENSAGEM_LIMITE_DE_CODIGOS, CAMPO_CODIGOS_BARRAS);
        }
        List<CodigoBarrasValidado> validados = new ArrayList<>(codigos.size());
        for (String codigo : codigos) {
            validados.add(codigoMantidoOuNovoValidado(empresaId, codigo, produtoAtual));
        }
        return validados;
    }

    /** Lista normalizada: {@code null} vira vazia e codigos vazios/so espacos sao descartados. */
    private static List<String> normalizarCodigos(List<String> informados) {
        if (informados == null) {
            return List.of();
        }
        return informados.stream()
                .map(CodigoBarras::normalizar)
                .filter(Objects::nonNull)
                .toList();
    }

    private static void exigirSemRepetidos(List<String> codigos) {
        Set<String> vistos = new HashSet<>();
        for (String codigo : codigos) {
            if (!vistos.add(codigo)) {
                throw new RegraDeNegocioException(MENSAGEM_CODIGO_REPETIDO, CAMPO_CODIGOS_BARRAS);
            }
        }
    }

    private CodigoBarrasValidado codigoMantidoOuNovoValidado(Long empresaId, String codigo, Produto produtoAtual) {
        if (produtoAtual != null) {
            Optional<ProdutoCodigoBarras> gravado = produtoAtual.codigoGravado(codigo);
            if (gravado.isPresent()) {
                return new CodigoBarrasValidado(codigo, gravado.get().getFormato());
            }
        }
        return codigoNovoValidado(empresaId, codigo, produtoAtual == null ? null : produtoAtual.getId());
    }

    private CodigoBarrasValidado codigoNovoValidado(Long empresaId, String codigo, Long produtoAtualId) {
        if (codigo.length() > TAMANHO_MAXIMO_CODIGO) {
            throw new RegraDeNegocioException(MENSAGEM_CODIGO_LONGO, CAMPO_CODIGOS_BARRAS);
        }
        if (CodigoBarras.ehCandidatoGs1(codigo) && !CodigoBarras.digitoVerificadorValido(codigo)) {
            throw new RegraDeNegocioException(MENSAGEM_DIGITO_INVALIDO.formatted(codigo), CAMPO_CODIGOS_BARRAS);
        }
        produtoRepository.produtoComCodigo(empresaId, codigo, produtoAtualId).ifPresent(nomeDoProduto -> {
            throw new ProdutoConflitoException(MENSAGEM_CODIGO_EM_OUTRO_PRODUTO.formatted(codigo, nomeDoProduto),
                    CAMPO_CODIGOS_BARRAS);
        });
        return new CodigoBarrasValidado(codigo, CodigoBarras.detectarFormato(codigo));
    }

    // ---------- Sugestoes (spec 4.4) ----------

    /** Allow-list dos campos de sugestao: o nome vindo da API nunca chega ao SQL. */
    private enum CampoDeSugestao {
        MARCA("marca"),
        FORNECEDOR("fornecedor");

        private final String nomeNaApi;

        CampoDeSugestao(String nomeNaApi) {
            this.nomeNaApi = nomeNaApi;
        }

        static CampoDeSugestao de(String campo) {
            for (CampoDeSugestao candidato : values()) {
                if (candidato.nomeNaApi.equals(campo)) {
                    return candidato;
                }
            }
            throw new RegraDeNegocioException(MENSAGEM_CAMPO_DE_SUGESTAO_INVALIDO);
        }
    }

    private static String termoDeSugestao(String termo) {
        if (!StringUtils.hasText(termo)) {
            return "";
        }
        String aparado = termo.trim();
        return aparado.length() <= TAMANHO_MAXIMO_TERMO_DE_SUGESTAO
                ? aparado
                : aparado.substring(0, TAMANHO_MAXIMO_TERMO_DE_SUGESTAO);
    }

    private static String emMinusculas(String texto) {
        return texto.toLowerCase(Locale.ROOT);
    }

    // ---------- Unidade, categoria e conversao de compra ----------

    /** Cadastros vinculados ao produto, ja resolvidos e validados dentro da empresa. */
    private record Vinculos(UnidadeMedida unidade, Categoria categoria, UnidadeMedida unidadeCompra) {
    }

    /**
     * Resolve unidade, categoria e unidade de compra pelo UUID dentro da
     * empresa (404 se de outra empresa) e aplica as regras da spec 5.1.
     * {@code produtoAtual} e {@code null} no cadastro; na edicao, permite
     * manter uma unidade/categoria que foi inativada depois (Review Focus 4).
     */
    private Vinculos resolverVinculos(Long empresaId, ProdutoRequest request, Produto produtoAtual) {
        validarConversaoDeCompra(request);
        UnidadeMedida unidade = unidadeService.buscarDaEmpresa(empresaId, request.unidadeId());
        exigirUnidadeAtivaOuAtual(unidade, produtoAtual == null ? null : produtoAtual.getUnidade(),
                MENSAGEM_UNIDADE_INATIVA);
        UnidadeMedida unidadeCompra = buscarUnidadeOpcional(empresaId, request.unidadeCompraId());
        exigirUnidadeAtivaOuAtual(unidadeCompra, produtoAtual == null ? null : produtoAtual.getUnidadeCompra(),
                MENSAGEM_UNIDADE_COMPRA_INATIVA);
        Categoria categoria = buscarCategoriaOpcional(empresaId, request.categoriaId());
        exigirCategoriaSelecionavelOuAtual(empresaId, categoria,
                produtoAtual == null ? null : produtoAtual.getCategoria());
        return new Vinculos(unidade, categoria, unidadeCompra);
    }

    /**
     * Regras que so dependem do request (antes de qualquer consulta): unidade
     * obrigatoria; unidade de compra e fator juntos; fator maior que zero
     * (defesa alem do Bean Validation, para chamadas sem {@code @Valid});
     * mesma unidade so com fator 1.
     */
    private static void validarConversaoDeCompra(ProdutoRequest request) {
        if (request.unidadeId() == null) {
            throw new RegraDeNegocioException(MENSAGEM_UNIDADE_OBRIGATORIA);
        }
        if ((request.unidadeCompraId() == null) != (request.fatorConversao() == null)) {
            throw new RegraDeNegocioException(MENSAGEM_COMPRA_E_FATOR_JUNTOS);
        }
        if (request.fatorConversao() != null && request.fatorConversao().signum() <= 0) {
            throw new RegraDeNegocioException(MENSAGEM_FATOR_NAO_POSITIVO);
        }
        if (request.unidadeId().equals(request.unidadeCompraId())
                && request.fatorConversao().compareTo(BigDecimal.ONE) != 0) {
            throw new RegraDeNegocioException(MENSAGEM_FATOR_DA_MESMA_UNIDADE);
        }
    }

    private UnidadeMedida buscarUnidadeOpcional(Long empresaId, UUID unidadeId) {
        return unidadeId == null ? null : unidadeService.buscarDaEmpresa(empresaId, unidadeId);
    }

    private Categoria buscarCategoriaOpcional(Long empresaId, UUID categoriaId) {
        return categoriaId == null ? null : categoriaService.buscarDaEmpresa(empresaId, categoriaId);
    }

    /**
     * Unidade inativa so e aceita se ja for a do produto (edicao sem trocar);
     * {@code mensagemSeInativa} diferencia unidade de venda e de compra.
     */
    private static void exigirUnidadeAtivaOuAtual(UnidadeMedida escolhida, UnidadeMedida atual,
            String mensagemSeInativa) {
        if (escolhida != null && !escolhida.isAtivo() && !mesmoRegistro(escolhida.getId(), atual)) {
            throw new RegraDeNegocioException(mensagemSeInativa);
        }
    }

    /**
     * Categoria nao selecionavel (inativa ou sob ancestral inativo) so e
     * aceita se ja for a do produto. A arvore so e montada quando precisa.
     */
    private void exigirCategoriaSelecionavelOuAtual(Long empresaId, Categoria escolhida, Categoria atual) {
        if (escolhida == null || mesmoRegistro(escolhida.getId(), atual)) {
            return;
        }
        if (!categoriaService.arvoreDaEmpresa(empresaId).selecionavel(escolhida.getId())) {
            throw new RegraDeNegocioException(MENSAGEM_CATEGORIA_INATIVA);
        }
    }

    private static boolean mesmoRegistro(Long idEscolhido, UnidadeMedida atual) {
        return atual != null && Objects.equals(atual.getId(), idEscolhido);
    }

    private static boolean mesmoRegistro(Long idEscolhido, Categoria atual) {
        return atual != null && Objects.equals(atual.getId(), idEscolhido);
    }

    // ---------- Promocao e atacado (docs/modules/produtos-precos.md, 4.3 e 4.4) ----------

    /**
     * Preco especial (promocional ou de atacado) e as mensagens dele: maior que
     * zero, menor que o preco de venda e nao abaixo do preco minimo.
     */
    private enum PrecoEspecial {
        PROMOCIONAL("Preço promocional", CAMPO_PROMOCAO_PRECO),
        ATACADO("Preço de atacado", CAMPO_ATACADO_PRECO);

        private final String nome;
        private final String campo;

        PrecoEspecial(String nome, String campo) {
            this.nome = nome;
            this.campo = campo;
        }

        void validar(BigDecimal preco, BigDecimal precoVenda, BigDecimal precoMinimo) {
            if (preco.signum() <= 0) {
                throw new RegraDeNegocioException(nome + " deve ser maior que zero.", campo);
            }
            if (preco.compareTo(precoVenda) >= 0) {
                throw new RegraDeNegocioException(nome + " deve ser menor que o preço de venda.", campo);
            }
            if (precoMinimo != null && preco.compareTo(precoMinimo) < 0) {
                throw new RegraDeNegocioException(nome + " não pode ser menor que o preço mínimo.", campo);
            }
        }
    }

    /**
     * Valida os blocos opcionais de promocao e atacado (nulo = sem o bloco).
     * Roda depois de {@code resolverVinculos}, porque a fracao da quantidade
     * minima depende da unidade de venda resolvida. As comparacoes sao com o
     * preco de venda DO REQUEST: baixar o preco de venda ate a promocao gravada
     * (que o formulario reenvia) da 400 em {@code promocao.preco}.
     *
     * <p>Promocao encerrada ou com datas no passado e aceita: nao se valida
     * "fim >= hoje", para nao bloquear a edicao de outros campos (spec 4.3).
     */
    private static void validarPromocaoEAtacado(ProdutoRequest request, UnidadeMedida unidade) {
        if (request.promocao() != null) {
            validarPromocao(request.promocao(), request.precoVenda(), request.precoMinimo());
        }
        if (request.atacado() != null) {
            validarAtacado(request.atacado(), request.precoVenda(), request.precoMinimo(), unidade);
        }
    }

    /** Ordem: completa -> periodo -> preco > 0 -> menor que a venda -> nao abaixo do minimo. */
    private static void validarPromocao(PromocaoRequest promocao, BigDecimal precoVenda, BigDecimal precoMinimo) {
        exigirInformado(promocao.preco(), MENSAGEM_PRECO_PROMOCIONAL_OBRIGATORIO, CAMPO_PROMOCAO_PRECO);
        exigirInformado(promocao.inicio(), MENSAGEM_INICIO_PROMOCAO_OBRIGATORIO, CAMPO_PROMOCAO_INICIO);
        exigirInformado(promocao.fim(), MENSAGEM_FIM_PROMOCAO_OBRIGATORIO, CAMPO_PROMOCAO_FIM);
        if (promocao.fim().isBefore(promocao.inicio())) {
            throw new RegraDeNegocioException(MENSAGEM_FIM_ANTES_DO_INICIO, CAMPO_PROMOCAO_FIM);
        }
        PrecoEspecial.PROMOCIONAL.validar(promocao.preco(), precoVenda, precoMinimo);
    }

    /**
     * Ordem: completo -> preco (> 0, menor que a venda, nao abaixo do minimo)
     * -> quantidade > 1 -> fracao conforme a unidade de venda -> ate 3 casas
     * (defesa alem do Bean Validation, para chamadas sem {@code @Valid}).
     */
    private static void validarAtacado(AtacadoRequest atacado, BigDecimal precoVenda, BigDecimal precoMinimo,
            UnidadeMedida unidade) {
        exigirInformado(atacado.preco(), MENSAGEM_PRECO_ATACADO_OBRIGATORIO, CAMPO_ATACADO_PRECO);
        exigirInformado(atacado.quantidadeMinima(), MENSAGEM_QUANTIDADE_ATACADO_OBRIGATORIA,
                CAMPO_ATACADO_QUANTIDADE_MINIMA);
        PrecoEspecial.ATACADO.validar(atacado.preco(), precoVenda, precoMinimo);
        BigDecimal quantidadeMinima = atacado.quantidadeMinima();
        if (quantidadeMinima.compareTo(BigDecimal.ONE) <= 0) {
            throw new RegraDeNegocioException(MENSAGEM_QUANTIDADE_ATACADO_ATE_UM, CAMPO_ATACADO_QUANTIDADE_MINIMA);
        }
        if (!UnidadeMedida.quantidadeValida(unidade.isFracionada(), quantidadeMinima)) {
            throw new RegraDeNegocioException(MENSAGEM_UNIDADE_NAO_FRACIONADA.formatted(unidade.getSigla()),
                    CAMPO_ATACADO_QUANTIDADE_MINIMA);
        }
        if (quantidadeMinima.stripTrailingZeros().scale() > CASAS_QUANTIDADE_ATACADO) {
            throw new RegraDeNegocioException(MENSAGEM_QUANTIDADE_ATACADO_CASAS, CAMPO_ATACADO_QUANTIDADE_MINIMA);
        }
    }

    /** Campo obrigatorio do bloco (defesa alem do Bean Validation, para chamadas sem {@code @Valid}). */
    private static void exigirInformado(Object valor, String mensagem, String campo) {
        if (valor == null) {
            throw new RegraDeNegocioException(mensagem, campo);
        }
    }

    // ---------- Historico de precos (docs/modules/produtos-precos.md, 4.6) ----------

    /**
     * Uma linha por campo que mudou, comparando numericamente (10,00 = 10,0)
     * e tratando nulo. No cadastro os anteriores sao nulos. Chamado depois do
     * {@code save} (o produto novo ja tem id), na mesma transacao: se o produto
     * nao for gravado, nada e registrado.
     */
    private void registrarHistorico(Produto produto, Long usuarioId, BigDecimal custoAnterior,
            BigDecimal precoAnterior) {
        registrarSeMudou(produto, usuarioId, CampoHistoricoPreco.PRECO_VENDA, precoAnterior, produto.getPrecoVenda());
        registrarSeMudou(produto, usuarioId, CampoHistoricoPreco.CUSTO, custoAnterior, produto.getCusto());
    }

    private void registrarSeMudou(Produto produto, Long usuarioId, CampoHistoricoPreco campo, BigDecimal anterior,
            BigDecimal novo) {
        if (!mesmoValor(anterior, novo)) {
            historicoPrecoRepository.save(new HistoricoPreco(produto, campo, anterior, novo, usuarioId));
        }
    }

    private static boolean mesmoValor(BigDecimal anterior, BigDecimal novo) {
        if (anterior == null || novo == null) {
            return anterior == novo;
        }
        return anterior.compareTo(novo) == 0;
    }

    private static void validarPaginacao(int pagina, int tamanho) {
        if (pagina < 0) {
            throw new RegraDeNegocioException(MENSAGEM_PAGINA_NEGATIVA);
        }
        if (tamanho < 1 || tamanho > TAMANHO_MAXIMO_PAGINA_HISTORICO) {
            throw new RegraDeNegocioException(MENSAGEM_TAMANHO_DE_PAGINA_INVALIDO);
        }
    }

    // ---------- Apoio ----------

    /**
     * Dados do cadastro a partir do request: textos aparados (vazio vira
     * {@code null}), vinculos resolvidos e promocao/atacado ausentes como nulos.
     */
    private static DadosProduto dadosDoProduto(ProdutoRequest request, Vinculos vinculos, String sku) {
        Optional<PromocaoRequest> promocao = Optional.ofNullable(request.promocao());
        Optional<AtacadoRequest> atacado = Optional.ofNullable(request.atacado());
        return new DadosProduto(request.nome().trim(), normalizarOuNulo(request.nomeCurto()),
                normalizarOuNulo(request.marca()), normalizarOuNulo(request.fornecedor()),
                normalizarOuNulo(request.descricao()), vinculos.unidade(), vinculos.categoria(),
                vinculos.unidadeCompra(), request.fatorConversao(), request.precoVenda(), request.custo(),
                request.precoMinimo(), request.estoqueMinimo(), request.estoqueMaximo(), request.pontoReposicao(),
                sku,
                promocao.map(PromocaoRequest::preco).orElse(null),
                promocao.map(PromocaoRequest::inicio).orElse(null),
                promocao.map(PromocaoRequest::fim).orElse(null),
                atacado.map(AtacadoRequest::preco).orElse(null),
                atacado.map(AtacadoRequest::quantidadeMinima).orElse(null));
    }

    /** Resposta de um produto; a arvore so e carregada se o produto tiver categoria. */
    private ProdutoResponse responder(Produto produto) {
        CategoriaArvore arvore = produto.getCategoria() == null
                ? CategoriaArvore.de(List.of())
                : categoriaService.arvoreDaEmpresa(produto.getEmpresaId());
        return ProdutoResponse.de(produto, arvore, podeExcluir(produto), SituacaoPromocao.hoje(relogio));
    }

    /**
     * Resposta depois de aplicar a alteracao no banco: o {@code flush} dispara o
     * {@code @PreUpdate} do produto, entao o {@code atualizadoEm} da resposta e
     * o mesmo que ficou gravado.
     */
    private ProdutoResponse responderAposGravar(Produto produto) {
        produtoRepository.flush();
        return responder(produto);
    }

    private Long resolverEmpresaId(Long idUsuario) {
        Usuario usuario = usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
        return usuario.getEmpresaId();
    }

    /**
     * Normaliza string em branco/vazia para {@code null} e apara as demais.
     * Evita gravar {@code ""}: a constraint UNIQUE(empresa_id, sku) do Postgres
     * trata multiplas strings vazias como conflitantes entre si (diferente de
     * NULL), e a V7 proibe nome curto/fornecedor vazios ou com espacos nas pontas.
     */
    private static String normalizarOuNulo(String valor) {
        return StringUtils.hasText(valor) ? valor.trim() : null;
    }

    private static void validarCampos(ProdutoRequest request) {
        validarDadosBasicos(request.nome(), request.precoVenda(), request.custo(), request.estoqueMinimo());
        validarCamposCadastrais(request.precoVenda(), request.estoqueMinimo(), request.estoqueMaximo(),
                request.pontoReposicao(), request.precoMinimo());
    }

    private static void validarDadosBasicos(String nome, BigDecimal precoVenda, BigDecimal custo,
            BigDecimal estoqueMinimo) {
        if (!StringUtils.hasText(nome)) {
            throw new RegraDeNegocioException("Nome do produto é obrigatório.");
        }
        if (precoVenda == null) {
            throw new RegraDeNegocioException("Preço de venda é obrigatório.");
        }
        if (precoVenda.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Preço de venda não pode ser negativo.");
        }
        if (custo != null && custo.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Custo não pode ser negativo.");
        }
        if (estoqueMinimo != null && estoqueMinimo.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Estoque mínimo não pode ser negativo.");
        }
    }

    /**
     * Valida os campos cadastrais do incremento (V4): nao-negativos dos novos
     * numericos e as regras cruzadas (preco minimo x preco de venda; estoque
     * maximo x estoque minimo). As regras cruzadas so sao aplicadas quando ambos
     * os lados estao informados. A violacao gera {@link RegraDeNegocioException}
     * (400), nunca deixa a constraint do banco falhar.
     */
    private static void validarCamposCadastrais(BigDecimal precoVenda, BigDecimal estoqueMinimo,
            BigDecimal estoqueMaximo, BigDecimal pontoReposicao, BigDecimal precoMinimo) {
        if (estoqueMaximo != null && estoqueMaximo.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Estoque máximo não pode ser negativo.");
        }
        if (pontoReposicao != null && pontoReposicao.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Ponto de reposição não pode ser negativo.");
        }
        if (precoMinimo != null && precoMinimo.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Preço mínimo não pode ser negativo.");
        }
        if (precoMinimo != null && precoVenda != null && precoMinimo.compareTo(precoVenda) > 0) {
            throw new RegraDeNegocioException("Preço mínimo não pode ser maior que o preço de venda.");
        }
        if (estoqueMaximo != null && estoqueMinimo != null && estoqueMaximo.compareTo(estoqueMinimo) < 0) {
            throw new RegraDeNegocioException("Estoque máximo não pode ser menor que o estoque mínimo.");
        }
    }

    private void garantirSkuDisponivelParaNovoProduto(Long empresaId, String sku) {
        if (sku != null && produtoRepository.existsBySkuAndEmpresa_Id(sku, empresaId)) {
            throw new ProdutoConflitoException(MENSAGEM_SKU_DUPLICADO, CAMPO_SKU);
        }
    }

    private void garantirSkuDisponivelParaProdutoExistente(Long empresaId, Long produtoId, String sku) {
        if (sku != null && produtoRepository.existsBySkuAndEmpresa_IdAndIdNot(sku, empresaId, produtoId)) {
            throw new ProdutoConflitoException(MENSAGEM_SKU_DUPLICADO, CAMPO_SKU);
        }
    }
}
