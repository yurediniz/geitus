package com.geitus.app.inventory;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.boot.test.context.TestComponent;
import org.springframework.jdbc.core.JdbcTemplate;

import com.geitus.app.catalog.ProdutoService;
import com.geitus.app.catalog.dto.EmbalagemRequest;
import com.geitus.app.catalog.dto.ProdutoRequest;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaRequest;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.iam.JwtService;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Dados dos testes de integracao do estoque: empresas com admin e unidades
 * padrao, produtos cadastrados pelo {@link ProdutoService} real e leituras de
 * conferencia via JDBC. Cada chamada usa nomes unicos, entao os testes nao
 * precisam limpar o banco. Importado explicitamente ({@code @Import}): o
 * {@code @TestComponent} fica fora do component scan.
 */
@TestComponent
class CenarioDeEstoque {

    private static final AtomicInteger SEQUENCIA = new AtomicInteger();

    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;
    private final UnidadeMedidaService unidadeService;
    private final ProdutoService produtoService;
    private final JdbcTemplate jdbcTemplate;
    private final JwtService jwtService;

    CenarioDeEstoque(EmpresaRepository empresaRepository, UsuarioRepository usuarioRepository,
            UnidadeMedidaService unidadeService, ProdutoService produtoService, JdbcTemplate jdbcTemplate,
            JwtService jwtService) {
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
        this.unidadeService = unidadeService;
        this.produtoService = produtoService;
        this.jdbcTemplate = jdbcTemplate;
        this.jwtService = jwtService;
    }

    /** Cabecalho {@code Authorization} com o JWT do usuario. */
    String token(Long idUsuario) {
        return "Bearer " + jwtService.gerarToken(usuarioRepository.findById(idUsuario).orElseThrow());
    }

    /** Empresa com unidades padrao e o id do seu ADMIN. */
    record EmpresaDeTeste(Empresa empresa, Long admin) {
    }

    /** Empresa FISICA (sem CNPJ), com as unidades padrao e um ADMIN chamado "Admin". */
    EmpresaDeTeste novaEmpresa() {
        String sufixo = String.valueOf(SEQUENCIA.incrementAndGet());
        String nome = "Empresa Estoque " + sufixo;
        Empresa empresa = new Empresa(nome);
        empresa.atualizarCadastro(nome, "1133224455", "contato" + sufixo + "@estoque.test", TipoPessoa.FISICA, null,
                null, null,
                new RepresentanteLegal("Representante " + sufixo, "11144477735", "11987654321",
                        "rep" + sufixo + "@estoque.test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        Empresa gravada = empresaRepository.saveAndFlush(empresa);
        unidadeService.criarPadroes(gravada);
        return new EmpresaDeTeste(gravada, novoUsuario(gravada, "Admin", "ADMIN"));
    }

    Long novoUsuario(Empresa empresa, String nome, String perfil) {
        Usuario usuario = new Usuario(empresa, nome, "usuario" + SEQUENCIA.incrementAndGet() + "@estoque.test",
                "hash-irrelevante-no-teste", perfil);
        return usuarioRepository.saveAndFlush(usuario).getId();
    }

    /** UUID publico da unidade padrao da empresa com a sigla. */
    UUID unidade(EmpresaDeTeste empresa, String sigla) {
        List<UnidadeMedidaResponse> unidades = unidadeService.listarParaUsuario(empresa.admin(), null);
        return unidades.stream()
                .filter(unidade -> unidade.sigla().equals(sigla))
                .map(UnidadeMedidaResponse::id)
                .findFirst()
                .orElseThrow();
    }

    /** Cadastra um produto que controla estoque, sem estoque inicial; devolve o UUID publico. */
    UUID novoProduto(EmpresaDeTeste empresa, String sigla, String nome) {
        return produtoService.cadastrarParaUsuario(empresa.admin(), produto(unidade(empresa, sigla), nome)).id();
    }

    /** Request minimo de cadastro (nome, preco e unidade), controlando estoque e sem estoque inicial. */
    static ProdutoRequest produto(UUID unidadeId, String nome) {
        return produto(unidadeId, nome, true, null);
    }

    /** Request minimo com o controle de estoque e o estoque inicial informados ({@code null} = sem). */
    static ProdutoRequest produto(UUID unidadeId, String nome, boolean controlaEstoque, String estoqueInicial) {
        return produto(unidadeId, nome, controlaEstoque, estoqueInicial, null);
    }

    /** Como o request minimo, com a lista de embalagens ({@code null} = campo ausente). */
    static ProdutoRequest produto(UUID unidadeId, String nome, boolean controlaEstoque, String estoqueInicial,
            List<EmbalagemRequest> embalagens) {
        return produtoComCusto(unidadeId, nome, null, controlaEstoque, estoqueInicial, embalagens);
    }

    /** Fase B4: como o request com embalagens, com o custo do cadastro ({@code null} = sem custo). */
    static ProdutoRequest produtoComCusto(UUID unidadeId, String nome, String custo, boolean controlaEstoque,
            String estoqueInicial, List<EmbalagemRequest> embalagens) {
        return new ProdutoRequest(nome, null, null, unidadeId, null, null,
                new BigDecimal("10.00"), custo == null ? null : new BigDecimal(custo), null, null, null, null,
                List.of(), embalagens, null, null, null, null, null, controlaEstoque,
                estoqueInicial == null ? null : new BigDecimal(estoqueInicial));
    }

    /**
     * Fase B4: PATCH do cadastro de um produto em UN com o nome e o custo
     * informados, mantendo as embalagens (campo ausente).
     */
    ProdutoResponse editarProduto(EmpresaDeTeste empresa, UUID produto, String nome, String custo) {
        return produtoService.atualizarDadosBasicosParaUsuario(empresa.admin(), produto,
                produtoComCusto(unidade(empresa, "UN"), nome, custo, true, null, null));
    }

    /**
     * Fase B3: produto em UN com a embalagem de compra "CX c/ {quantidade} UN";
     * devolve a resposta (com o id da embalagem).
     */
    ProdutoResponse novoProdutoComCaixa(EmpresaDeTeste empresa, String nome, String quantidadePorCaixa) {
        EmbalagemRequest caixa = new EmbalagemRequest(null, unidade(empresa, "CX"), new BigDecimal(quantidadePorCaixa),
                null, true, List.of());
        return produtoService.cadastrarParaUsuario(empresa.admin(),
                produto(unidade(empresa, "UN"), nome, true, null, List.of(caixa)));
    }

    /**
     * Produto com uma embalagem de compra ({@code siglaDaEmbalagem} c/
     * {@code quantidade} {@code siglaDeVenda}); cria a unidade da embalagem se
     * ela nao for padrao (ex.: SC).
     */
    ProdutoResponse novoProdutoComEmbalagem(EmpresaDeTeste empresa, String siglaDeVenda, String nome,
            String siglaDaEmbalagem, String quantidade, boolean controlaEstoque) {
        boolean existe = unidadeService.listarParaUsuario(empresa.admin(), null).stream()
                .anyMatch(unidade -> unidade.sigla().equals(siglaDaEmbalagem));
        if (!existe) {
            unidadeService.cadastrarParaUsuario(empresa.admin(),
                    new UnidadeMedidaRequest(siglaDaEmbalagem, "Unidade " + siglaDaEmbalagem, false));
        }
        EmbalagemRequest embalagem = new EmbalagemRequest(null, unidade(empresa, siglaDaEmbalagem),
                new BigDecimal(quantidade), null, true, List.of());
        return produtoService.cadastrarParaUsuario(empresa.admin(),
                produto(unidade(empresa, siglaDeVenda), nome, controlaEstoque, null, List.of(embalagem)));
    }

    /** Muda o conteudo da caixa (mesma embalagem, mesmo id) pelo PATCH do cadastro. */
    void trocarQuantidadeDaCaixa(EmpresaDeTeste empresa, UUID produto, String nome, UUID caixa, String quantidade) {
        EmbalagemRequest outra = new EmbalagemRequest(caixa, unidade(empresa, "CX"), new BigDecimal(quantidade), null,
                true, List.of());
        produtoService.atualizarDadosBasicosParaUsuario(empresa.admin(), produto,
                produto(unidade(empresa, "UN"), nome, true, null, List.of(outra)));
    }

    /** Tira todas as embalagens do produto pelo PATCH do cadastro. */
    void removerEmbalagens(EmpresaDeTeste empresa, UUID produto, String nome) {
        produtoService.atualizarDadosBasicosParaUsuario(empresa.admin(), produto,
                produto(unidade(empresa, "UN"), nome, true, null, List.of()));
    }

    /** Saldo gravado do produto; 0 sem linha de saldo. */
    BigDecimal saldo(UUID produto) {
        List<BigDecimal> saldos = jdbcTemplate.queryForList("""
                SELECT s.saldo FROM estoque_saldos s JOIN produtos p ON p.id = s.produto_id WHERE p.uuid = ?
                """, BigDecimal.class, produto);
        return saldos.isEmpty() ? BigDecimal.ZERO : saldos.get(0);
    }

    long contarMovimentos(UUID produto) {
        return jdbcTemplate.queryForObject("""
                SELECT count(*) FROM movimentos_estoque m JOIN produtos p ON p.id = m.produto_id WHERE p.uuid = ?
                """, Long.class, produto);
    }

    Long idInterno(UUID produto) {
        return jdbcTemplate.queryForObject("SELECT id FROM produtos WHERE uuid = ?", Long.class, produto);
    }
}
