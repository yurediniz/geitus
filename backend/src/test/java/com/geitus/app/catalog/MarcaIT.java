package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.listagem.ParametrosDaListagem;
import com.geitus.app.catalog.marca.Marca;
import com.geitus.app.catalog.marca.MarcaRepository;
import com.geitus.app.catalog.marca.MarcaService;
import com.geitus.app.catalog.marca.dto.MarcaRequest;
import com.geitus.app.catalog.marca.dto.MarcaResponse;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.shared.paginacao.PaginaResponse;

/**
 * Fabricantes e marcas (Fase B5) com o contexto Spring completo e um
 * PostgreSQL real (Testcontainers, Flyway ate a V14): as regras da arvore com
 * as consultas reais do {@link MarcaRepository} (contagens nativas de produtos
 * e de fornecedores), a marca no produto (isolamento, inativa so se ja for a
 * atual, caminho na resposta e busca pelo nome) e o renomear que recalcula a
 * busca dos produtos (docs/modules/fornecedores-e-marcas.md, 3; Review Focus 3).
 *
 * <p>Sem {@code @Transactional} na classe: cada chamada de service confirma a
 * propria transacao, como em producao. Cada teste usa uma empresa nova.
 * Requer Docker.
 */
@SpringBootTest
@Testcontainers
class MarcaIT {

    private static final AtomicInteger SEQUENCIA = new AtomicInteger();
    private static final int PRODUTOS_DA_MARCA_RENOMEADA = 30;
    private static final int TAMANHO_DA_PAGINA = 50;

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configurarDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    @Autowired
    private EmpresaRepository empresaRepository;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private UnidadeMedidaService unidadeService;

    @Autowired
    private MarcaService marcaService;

    @Autowired
    private MarcaRepository marcaRepository;

    @Autowired
    private ProdutoService produtoService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // ---------- Arvore ----------

    @Test
    void arvoreDeMarcasComCaminhoCicloENomeEntreIrmaos() {
        Loja loja = novaLoja();
        MarcaResponse boehringer = criar(loja, "Boehringer", null);
        MarcaResponse nexgard = criar(loja, "Nexgard", boehringer.id());
        MarcaResponse combo = criar(loja, "Nexgard Combo", nexgard.id());

        assertThat(combo.caminho()).isEqualTo("Boehringer › Nexgard › Nexgard Combo");
        assertThat(combo.nivel()).isEqualTo(2);
        assertThatThrownBy(() -> marcaService.atualizarParaUsuario(loja.admin(), boehringer.id(),
                new MarcaRequest("Boehringer", combo.id())))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Uma marca não pode ficar dentro dela mesma ou de uma submarca sua.");
        assertThatThrownBy(() -> criar(loja, "NEXGARD", boehringer.id()))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage("Já existe uma marca com este nome neste nível.");
        assertThat(marcaService.listarParaUsuario(loja.admin(), null)).extracting(MarcaResponse::caminho)
                .containsExactly("Boehringer", "Boehringer › Nexgard", "Boehringer › Nexgard › Nexgard Combo");
    }

    @Test
    void exclusaoBarradaPorSubmarcaProdutoEFornecedorComAsContagensReais() {
        Loja loja = novaLoja();
        MarcaResponse boehringer = criar(loja, "Boehringer", null);
        MarcaResponse nexgard = criar(loja, "Nexgard", boehringer.id());
        ProdutoResponse produto = produtoService.cadastrarParaUsuario(loja.admin(),
                ProdutoRequestBuilder.comUnidade(loja.un()).nome("Nexgard M").marcaId(boehringer.id()).build());
        Long fornecedor = fornecedorDaMarca(loja, boehringer.id());

        assertThatThrownBy(() -> marcaService.excluirParaUsuario(loja.admin(), boehringer.id()))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage("Não é possível excluir: há 1 submarca(s), 1 produto(s) e 1 fornecedor(es) nesta "
                        + "marca. Mova-os ou inative a marca.");
        MarcaResponse naLista = marcaService.listarParaUsuario(loja.admin(), null).get(0);
        assertThat(naLista.quantidadeSubmarcas()).isEqualTo(1);
        assertThat(naLista.quantidadeProdutos()).isEqualTo(1);
        assertThat(naLista.quantidadeFornecedores()).isEqualTo(1);

        marcaService.excluirParaUsuario(loja.admin(), nexgard.id());
        produtoService.excluirParaUsuario(loja.admin(), produto.id());
        jdbcTemplate.update("DELETE FROM fornecedores WHERE id = ?", fornecedor);
        assertThatCode(() -> marcaService.excluirParaUsuario(loja.admin(), boehringer.id()))
                .doesNotThrowAnyException();
        assertThat(marcaService.listarParaUsuario(loja.admin(), null)).isEmpty();
    }

    @Test
    void marcasDeOutraEmpresaNaoSaoEncontradasPeloRepositorio() {
        Loja loja = novaLoja();
        Loja outra = novaLoja();
        MarcaResponse daLoja = criar(loja, "Golden", null);
        MarcaResponse daOutra = criar(outra, "Golden", null);
        Long idDaLoja = idInterno(daLoja.id());
        Long idDaOutra = idInterno(daOutra.id());

        assertThat(marcaRepository.findByEmpresa_IdAndIdIn(loja.empresa().getId(), List.of(idDaLoja, idDaOutra)))
                .extracting(Marca::getId).containsExactly(idDaLoja);
        assertThat(marcaRepository.findByUuidAndEmpresa_Id(daOutra.id(), loja.empresa().getId())).isEmpty();
    }

    // ---------- Marca no produto ----------

    @Test
    void produtoComMarcaDeOutraEmpresaResponde404() {
        Loja loja = novaLoja();
        MarcaResponse daOutra = criar(novaLoja(), "Golden", null);

        assertThatThrownBy(() -> produtoService.cadastrarParaUsuario(loja.admin(),
                ProdutoRequestBuilder.comUnidade(loja.un()).nome("Ração").marcaId(daOutra.id()).build()))
                .isInstanceOf(CatalogoNaoEncontradoException.class)
                .hasMessage("Marca não encontrada.");
    }

    @Test
    void marcaNaoSelecionavelSoEAceitaSeJaForADoProduto() {
        Loja loja = novaLoja();
        MarcaResponse boehringer = criar(loja, "Boehringer", null);
        MarcaResponse nexgard = criar(loja, "Nexgard", boehringer.id());
        ProdutoResponse produto = produtoService.cadastrarParaUsuario(loja.admin(),
                ProdutoRequestBuilder.comUnidade(loja.un()).nome("Nexgard M").marcaId(nexgard.id()).build());
        marcaService.inativarParaUsuario(loja.admin(), boehringer.id());

        assertThatCode(() -> produtoService.atualizarDadosBasicosParaUsuario(loja.admin(), produto.id(),
                ProdutoRequestBuilder.comUnidade(loja.un()).nome("Nexgard M").marcaId(nexgard.id()).build()))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> produtoService.cadastrarParaUsuario(loja.admin(),
                ProdutoRequestBuilder.comUnidade(loja.un()).nome("Nexgard G").marcaId(nexgard.id()).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Esta marca está inativa. Escolha uma marca ativa.");
    }

    @Test
    void respostaTrazAMarcaComOCaminhoEABuscaAchaPeloNomeDaMarca() {
        Loja loja = novaLoja();
        MarcaResponse boehringer = criar(loja, "Boehringer", null);
        MarcaResponse nexgard = criar(loja, "Nexgard", boehringer.id());
        ProdutoResponse produto = produtoService.cadastrarParaUsuario(loja.admin(),
                ProdutoRequestBuilder.comUnidade(loja.un()).nome("Antipulgas M").marcaId(nexgard.id()).build());
        produtoService.cadastrarParaUsuario(loja.admin(),
                ProdutoRequestBuilder.comUnidade(loja.un()).nome("Coleira").build());

        assertThat(produto.marca().id()).isEqualTo(nexgard.id());
        assertThat(produto.marca().nome()).isEqualTo("Nexgard");
        assertThat(produto.marca().caminho()).isEqualTo("Boehringer › Nexgard");
        assertThat(produtoService.buscarPorIdParaUsuario(loja.admin(), produto.id()).marca().caminho())
                .isEqualTo("Boehringer › Nexgard");
        PaginaResponse<ProdutoResponse> pelaMarca = listar(loja, "nexgard");
        assertThat(pelaMarca.itens()).extracting(ProdutoResponse::nome).containsExactly("Antipulgas M");
        assertThat(pelaMarca.itens().get(0).marca().caminho()).isEqualTo("Boehringer › Nexgard");
        assertThat(listar(loja, "boehringer").totalItens()).isZero();
    }

    @Test
    void produtoSemMarcaETirarAMarcaDeixaNulo() {
        Loja loja = novaLoja();
        MarcaResponse golden = criar(loja, "Golden", null);
        ProdutoResponse produto = produtoService.cadastrarParaUsuario(loja.admin(),
                ProdutoRequestBuilder.comUnidade(loja.un()).nome("Ração").marcaId(golden.id()).build());

        ProdutoResponse semMarca = produtoService.atualizarDadosBasicosParaUsuario(loja.admin(), produto.id(),
                ProdutoRequestBuilder.comUnidade(loja.un()).nome("Ração").build());

        assertThat(semMarca.marca()).isNull();
        assertThat(listar(loja, "golden").totalItens()).isZero();
    }

    // ---------- Renomear (Review Focus 3) ----------

    @Test
    void renomearMarcaDe30ProdutosAtualizaABuscaDeTodos() {
        Loja loja = novaLoja();
        MarcaResponse golden = criar(loja, "Golden", null);
        for (int numero = 1; numero <= PRODUTOS_DA_MARCA_RENOMEADA; numero++) {
            produtoService.cadastrarParaUsuario(loja.admin(), ProdutoRequestBuilder.comUnidade(loja.un())
                    .nome("Ração " + numero).sku("SKU-" + numero).marcaId(golden.id()).build());
        }
        produtoService.cadastrarParaUsuario(loja.admin(),
                ProdutoRequestBuilder.comUnidade(loja.un()).nome("Ração sem marca").build());
        assertThat(listar(loja, "golden").totalItens()).isEqualTo(PRODUTOS_DA_MARCA_RENOMEADA);

        marcaService.atualizarParaUsuario(loja.admin(), golden.id(), new MarcaRequest("Premier Pét", null));

        assertThat(listar(loja, "premier pet").totalItens()).isEqualTo(PRODUTOS_DA_MARCA_RENOMEADA);
        assertThat(listar(loja, "golden").totalItens()).isZero();
        assertThat(listar(loja, "sku-7 premier").itens()).extracting(ProdutoResponse::nome)
                .containsExactly("Ração 7");
        assertThat(jdbcTemplate.queryForObject("SELECT busca_normalizada FROM produtos WHERE empresa_id = ?"
                + " AND sku = 'SKU-1'", String.class, loja.empresa().getId())).isEqualTo("racao 1 sku-1 premier pet");
    }

    // ---------- Apoio ----------

    private record Loja(Empresa empresa, Long admin, UUID un) {
    }

    private MarcaResponse criar(Loja loja, String nome, UUID pai) {
        return marcaService.cadastrarParaUsuario(loja.admin(), new MarcaRequest(nome, pai));
    }

    private PaginaResponse<ProdutoResponse> listar(Loja loja, String busca) {
        return produtoService.listarParaUsuario(loja.admin(),
                ParametrosDaListagem.daRequisicao(busca, null, null, null, null, null, 0, TAMANHO_DA_PAGINA));
    }

    private Long idInterno(UUID marca) {
        return jdbcTemplate.queryForObject("SELECT id FROM marcas WHERE uuid = ?", Long.class, marca);
    }

    /** Fornecedor gravado direto no banco (o cadastro de fornecedores e da Task 4), ligado a marca. */
    private Long fornecedorDaMarca(Loja loja, UUID marca) {
        Long empresaId = loja.empresa().getId();
        Long fornecedor = jdbcTemplate.queryForObject("INSERT INTO fornecedores (empresa_id, numero, razao_social,"
                + " busca_normalizada, nome_normalizado) VALUES (?, 1, 'Distribuidora', 'distribuidora',"
                + " 'distribuidora') RETURNING id", Long.class, empresaId);
        jdbcTemplate.update("INSERT INTO fornecedor_marcas (empresa_id, fornecedor_id, marca_id) VALUES (?, ?, ?)",
                empresaId, fornecedor, idInterno(marca));
        return fornecedor;
    }

    /** Empresa FISICA com as unidades padrao e um ADMIN. */
    private Loja novaLoja() {
        String sufixo = String.valueOf(SEQUENCIA.incrementAndGet());
        String nome = "Empresa Marcas " + sufixo;
        Empresa empresa = new Empresa(nome);
        empresa.atualizarCadastro(nome, "1133224455", "contato" + sufixo + "@marcas.test", TipoPessoa.FISICA,
                null, null, null,
                new RepresentanteLegal("Representante " + sufixo, "11144477735", "11987654321",
                        "rep" + sufixo + "@marcas.test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        Empresa gravada = empresaRepository.saveAndFlush(empresa);
        Long admin = usuarioRepository.saveAndFlush(new Usuario(gravada, "Admin",
                "admin" + sufixo + "@marcas.test", "hash-irrelevante-no-teste", "ADMIN")).getId();
        unidadeService.criarPadroes(gravada);
        UUID un = unidadeService.listarParaUsuario(admin, null).stream()
                .filter(unidade -> unidade.sigla().equals("UN"))
                .map(UnidadeMedidaResponse::id)
                .findFirst()
                .orElseThrow();
        return new Loja(gravada, admin, un);
    }
}
