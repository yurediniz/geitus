package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

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

/**
 * Regras de negocio do modulo Produtos.
 *
 * <p>Toda a regra de negocio fica concentrada aqui (arquitetura por camadas do
 * CLAUDE.md), consumida por um controller fino ({@code ProdutoController}).
 *
 * <p>O {@code empresaId} recebido pelos metodos internos representa SEMPRE a
 * empresa do usuario autenticado (nunca uma escolha livre do chamador) e e
 * usado para isolar consultas e alteracoes por tenant (DEC-016): um produto de
 * outra empresa nunca deve ser encontrado, atualizado ou vazado. O mesmo vale
 * para a unidade, a categoria e a unidade de compra informadas: sao buscadas
 * dentro da empresa e, se forem de outra, respondem 404.
 *
 * <p>A API publica do service e composta apenas pelos metodos {@code *ParaUsuario},
 * que recebem {@code idUsuario} (o id extraido do JWT) e resolvem a empresa
 * internamente, no mesmo padrao usado em {@code EmpresaService.buscarUsuarioAtivo}:
 * assim o controller nunca manipula {@code empresaId} diretamente. Eles devolvem
 * o {@link ProdutoResponse} ja montado, com o caminho da categoria vindo da
 * {@link CategoriaArvore} da empresa — na listagem, montada uma unica vez. Os
 * metodos que recebem {@code empresaId} sao de uso interno (package-private) e
 * concentram a regra de isolamento por tenant.
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
        String skuNormalizado = normalizarOuNulo(request.sku());
        String codigoBarrasNormalizado = normalizarOuNulo(request.codigoBarras());
        validarUnicidadeParaNovoProduto(empresaId, skuNormalizado, codigoBarrasNormalizado);
        Vinculos vinculos = resolverVinculos(empresaId, request, null);

        Empresa empresa = empresaRepository.findById(empresaId)
                .orElseThrow(() -> new RegraDeNegocioException("Empresa informada não encontrada."));

        Produto produto = new Produto(empresa, request.nome().trim(), vinculos.unidade(), vinculos.categoria(),
                vinculos.unidadeCompra(), request.fatorConversao(), request.precoVenda(), request.custo(),
                request.estoqueMinimo(), codigoBarrasNormalizado, skuNormalizado, normalizarOuNulo(request.marca()),
                normalizarOuNulo(request.descricao()), request.estoqueMaximo(), request.pontoReposicao(),
                request.precoMinimo());

        return produtoRepository.save(produto);
    }

    Produto atualizarDadosBasicos(Long empresaId, Long produtoId, ProdutoRequest request) {
        Produto produto = buscarPorId(empresaId, produtoId);

        validarCampos(request);
        String skuNormalizado = normalizarOuNulo(request.sku());
        String codigoBarrasNormalizado = normalizarOuNulo(request.codigoBarras());
        validarUnicidadeParaAtualizacao(empresaId, produtoId, skuNormalizado, codigoBarrasNormalizado);
        Vinculos vinculos = resolverVinculos(empresaId, request, produto);

        produto.atualizarDadosBasicos(request.nome().trim(), vinculos.unidade(), vinculos.categoria(),
                vinculos.unidadeCompra(), request.fatorConversao(), request.precoVenda(), request.custo(),
                request.estoqueMinimo(), codigoBarrasNormalizado, skuNormalizado, normalizarOuNulo(request.marca()),
                normalizarOuNulo(request.descricao()), request.estoqueMaximo(), request.pontoReposicao(),
                request.precoMinimo());

        return produtoRepository.save(produto);
    }

    Produto inativar(Long empresaId, Long produtoId) {
        Produto produto = buscarPorId(empresaId, produtoId);
        produto.inativar();
        return produtoRepository.save(produto);
    }

    Produto reativar(Long empresaId, Long produtoId) {
        Produto produto = buscarPorId(empresaId, produtoId);
        produto.ativar();
        return produtoRepository.save(produto);
    }

    Produto buscarPorId(Long empresaId, Long produtoId) {
        return produtoRepository.findByIdAndEmpresa_Id(produtoId, empresaId)
                .orElseThrow(ProdutoNaoEncontradoException::new);
    }

    List<Produto> listarPorEmpresaComFiltros(Long empresaId, String busca, Boolean ativo) {
        // Sem termo de busca, usa a query sem o parametro :busca — passar null
        // para dentro de LOWER(CONCAT(...)) falha no PostgreSQL (bytea).
        if (!StringUtils.hasText(busca)) {
            return produtoRepository.buscarPorEmpresa(empresaId, ativo);
        }
        return produtoRepository.buscarPorEmpresaComBusca(empresaId, busca.trim(), ativo);
    }

    // ---------- API publica (empresa sempre resolvida do usuario do JWT) ----------

    @Transactional
    public ProdutoResponse cadastrarParaUsuario(Long idUsuario, ProdutoRequest request) {
        return responder(cadastrar(resolverEmpresaId(idUsuario), request));
    }

    @Transactional
    public ProdutoResponse atualizarDadosBasicosParaUsuario(Long idUsuario, Long produtoId, ProdutoRequest request) {
        return responder(atualizarDadosBasicos(resolverEmpresaId(idUsuario), produtoId, request));
    }

    @Transactional
    public ProdutoResponse inativarParaUsuario(Long idUsuario, Long produtoId) {
        return responder(inativar(resolverEmpresaId(idUsuario), produtoId));
    }

    @Transactional
    public ProdutoResponse reativarParaUsuario(Long idUsuario, Long produtoId) {
        return responder(reativar(resolverEmpresaId(idUsuario), produtoId));
    }

    @Transactional(readOnly = true)
    public ProdutoResponse buscarPorIdParaUsuario(Long idUsuario, Long produtoId) {
        return responder(buscarPorId(resolverEmpresaId(idUsuario), produtoId));
    }

    /** Lista com filtros; a arvore de categorias e montada uma unica vez para todos os produtos. */
    @Transactional(readOnly = true)
    public List<ProdutoResponse> listarParaUsuario(Long idUsuario, String busca, Boolean ativo) {
        Long empresaId = resolverEmpresaId(idUsuario);
        List<Produto> produtos = listarPorEmpresaComFiltros(empresaId, busca, ativo);
        CategoriaArvore arvore = categoriaService.arvoreDaEmpresa(empresaId);
        return produtos.stream()
                .map(produto -> ProdutoResponse.de(produto, arvore))
                .toList();
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

    /** Resposta de um produto; a arvore so e carregada se o produto tiver categoria. */
    private ProdutoResponse responder(Produto produto) {
        CategoriaArvore arvore = produto.getCategoria() == null
                ? CategoriaArvore.de(List.of())
                : categoriaService.arvoreDaEmpresa(produto.getEmpresaId());
        return ProdutoResponse.de(produto, arvore);
    }

    private Long resolverEmpresaId(Long idUsuario) {
        Usuario usuario = usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
        return usuario.getEmpresaId();
    }

    /**
     * Normaliza string em branco/vazia para {@code null}. Evita que
     * {@code sku}/{@code codigoBarras} sejam persistidos como string vazia
     * {@code ""}: a constraint UNIQUE(empresa_id, coluna) do Postgres trata
     * multiplas strings vazias como conflitantes entre si (diferente de
     * NULL, que nunca conflita), o que geraria erro de integridade para
     * produtos sem SKU/codigo de barras informado.
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

    private void validarUnicidadeParaNovoProduto(Long empresaId, String sku, String codigoBarras) {
        if (StringUtils.hasText(sku) && produtoRepository.existsBySkuAndEmpresa_Id(sku, empresaId)) {
            throw new ProdutoConflitoException("Já existe um produto com este SKU nesta empresa.");
        }
        if (StringUtils.hasText(codigoBarras)
                && produtoRepository.existsByCodigoBarrasAndEmpresa_Id(codigoBarras, empresaId)) {
            throw new ProdutoConflitoException("Já existe um produto com este código de barras nesta empresa.");
        }
    }

    private void validarUnicidadeParaAtualizacao(Long empresaId, Long produtoId, String sku, String codigoBarras) {
        if (StringUtils.hasText(sku)
                && produtoRepository.existsBySkuAndEmpresa_IdAndIdNot(sku, empresaId, produtoId)) {
            throw new ProdutoConflitoException("Já existe um produto com este SKU nesta empresa.");
        }
        if (StringUtils.hasText(codigoBarras)
                && produtoRepository.existsByCodigoBarrasAndEmpresa_IdAndIdNot(codigoBarras, empresaId, produtoId)) {
            throw new ProdutoConflitoException("Já existe um produto com este código de barras nesta empresa.");
        }
    }
}
