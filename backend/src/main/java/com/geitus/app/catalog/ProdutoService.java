package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.math.BigInteger;
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

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.categoria.CategoriaService;
import com.geitus.app.catalog.dto.ProdutoRequest;
import com.geitus.app.catalog.dto.ProdutoResponse;
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

    static final int MAXIMO_CODIGOS_POR_PRODUTO = 20;
    static final int TAMANHO_MAXIMO_CODIGO = 50;
    static final int LIMITE_DE_SUGESTOES = 10;
    static final int TAMANHO_MAXIMO_TERMO_DE_SUGESTAO = 50;

    /** SKU no padrao da sugestao automatica: {@code P} + 6 ou mais digitos (spec 4.2). */
    private static final Pattern SKU_NO_PADRAO = Pattern.compile("P([0-9]{6,})");
    private static final String PREFIXO_SKU_SUGERIDO = "P";
    private static final String FORMATO_NUMERO_SKU_SUGERIDO = "%06d";

    private final ProdutoRepository produtoRepository;
    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;
    private final UnidadeMedidaService unidadeService;
    private final CategoriaService categoriaService;

    public ProdutoService(ProdutoRepository produtoRepository, EmpresaRepository empresaRepository,
            UsuarioRepository usuarioRepository, UnidadeMedidaService unidadeService,
            CategoriaService categoriaService) {
        this.produtoRepository = produtoRepository;
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
        this.unidadeService = unidadeService;
        this.categoriaService = categoriaService;
    }

    Produto cadastrar(Long empresaId, ProdutoRequest request) {
        validarCampos(request);
        List<CodigoBarrasValidado> codigos = validarCodigos(empresaId, request.codigosBarras(), null);
        String sku = normalizarOuNulo(request.sku());
        garantirSkuDisponivelParaNovoProduto(empresaId, sku);
        Vinculos vinculos = resolverVinculos(empresaId, request, null);

        Empresa empresa = empresaRepository.findById(empresaId)
                .orElseThrow(() -> new RegraDeNegocioException("Empresa informada não encontrada."));

        Produto produto = new Produto(empresa, dadosDoProduto(request, vinculos, sku));
        produto.substituirCodigos(codigos);
        return produtoRepository.save(produto);
    }

    Produto atualizarDadosBasicos(Long empresaId, UUID produtoId, ProdutoRequest request) {
        Produto produto = buscarPorId(empresaId, produtoId);

        validarCampos(request);
        List<CodigoBarrasValidado> codigos = validarCodigos(empresaId, request.codigosBarras(), produto);
        String sku = normalizarOuNulo(request.sku());
        garantirSkuDisponivelParaProdutoExistente(empresaId, produto.getId(), sku);
        Vinculos vinculos = resolverVinculos(empresaId, request, produto);

        produto.atualizarDadosBasicos(dadosDoProduto(request, vinculos, sku));
        produto.substituirCodigos(codigos);
        return produtoRepository.save(produto);
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
     */
    void excluir(Long empresaId, UUID produtoId) {
        Produto produto = buscarPorId(empresaId, produtoId);
        if (!podeExcluir(produto)) {
            throw new ProdutoConflitoException(MENSAGEM_EXCLUSAO_BLOQUEADA);
        }
        produtoRepository.delete(produto);
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
     */
    List<Produto> listarPorEmpresaComFiltros(Long empresaId, String busca, Boolean ativo) {
        if (!StringUtils.hasText(busca)) {
            return produtoRepository.buscarPorEmpresa(empresaId, ativo);
        }
        String padraoTexto = PadraoLike.contem(emMinusculas(busca.trim()));
        String padraoCodigo = PadraoLike.contem(emMinusculas(CodigoBarras.normalizar(busca)));
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
        return PREFIXO_SKU_SUGERIDO + String.format(FORMATO_NUMERO_SKU_SUGERIDO, maiorNumero.add(BigInteger.ONE));
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
        return responder(cadastrar(resolverEmpresaId(idUsuario), request));
    }

    @Transactional
    public ProdutoResponse atualizarDadosBasicosParaUsuario(Long idUsuario, UUID produtoId, ProdutoRequest request) {
        return responder(atualizarDadosBasicos(resolverEmpresaId(idUsuario), produtoId, request));
    }

    @Transactional
    public ProdutoResponse inativarParaUsuario(Long idUsuario, UUID produtoId) {
        return responder(inativar(resolverEmpresaId(idUsuario), produtoId));
    }

    @Transactional
    public ProdutoResponse reativarParaUsuario(Long idUsuario, UUID produtoId) {
        return responder(reativar(resolverEmpresaId(idUsuario), produtoId));
    }

    @Transactional
    public void excluirParaUsuario(Long idUsuario, UUID produtoId) {
        excluir(resolverEmpresaId(idUsuario), produtoId);
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
        return produtos.stream()
                .map(produto -> ProdutoResponse.de(produto, arvore, podeExcluir(produto)))
                .toList();
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
            throw new RegraDeNegocioException(MENSAGEM_LIMITE_DE_CODIGOS);
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
                throw new RegraDeNegocioException(MENSAGEM_CODIGO_REPETIDO);
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
            throw new RegraDeNegocioException(MENSAGEM_CODIGO_LONGO);
        }
        if (CodigoBarras.ehCandidatoGs1(codigo) && !CodigoBarras.digitoVerificadorValido(codigo)) {
            throw new RegraDeNegocioException(MENSAGEM_DIGITO_INVALIDO.formatted(codigo));
        }
        produtoRepository.produtoComCodigo(empresaId, codigo, produtoAtualId).ifPresent(nomeDoProduto -> {
            throw new ProdutoConflitoException(MENSAGEM_CODIGO_EM_OUTRO_PRODUTO.formatted(codigo, nomeDoProduto));
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

    // ---------- Apoio ----------

    /** Dados do cadastro a partir do request: textos aparados (vazio vira {@code null}) e vinculos resolvidos. */
    private static DadosProduto dadosDoProduto(ProdutoRequest request, Vinculos vinculos, String sku) {
        return new DadosProduto(request.nome().trim(), normalizarOuNulo(request.nomeCurto()),
                normalizarOuNulo(request.marca()), normalizarOuNulo(request.fornecedor()),
                normalizarOuNulo(request.descricao()), vinculos.unidade(), vinculos.categoria(),
                vinculos.unidadeCompra(), request.fatorConversao(), request.precoVenda(), request.custo(),
                request.precoMinimo(), request.estoqueMinimo(), request.estoqueMaximo(), request.pontoReposicao(),
                sku);
    }

    /** Resposta de um produto; a arvore so e carregada se o produto tiver categoria. */
    private ProdutoResponse responder(Produto produto) {
        CategoriaArvore arvore = produto.getCategoria() == null
                ? CategoriaArvore.de(List.of())
                : categoriaService.arvoreDaEmpresa(produto.getEmpresaId());
        return ProdutoResponse.de(produto, arvore, podeExcluir(produto));
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
            throw new ProdutoConflitoException(MENSAGEM_SKU_DUPLICADO);
        }
    }

    private void garantirSkuDisponivelParaProdutoExistente(Long empresaId, Long produtoId, String sku) {
        if (sku != null && produtoRepository.existsBySkuAndEmpresa_IdAndIdNot(sku, empresaId, produtoId)) {
            throw new ProdutoConflitoException(MENSAGEM_SKU_DUPLICADO);
        }
    }
}
