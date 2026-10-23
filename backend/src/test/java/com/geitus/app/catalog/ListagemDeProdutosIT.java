package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.categoria.CategoriaService;
import com.geitus.app.catalog.categoria.dto.CategoriaRequest;
import com.geitus.app.catalog.dto.CodigoBarrasResponse;
import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.listagem.ConsultaDeProdutos;
import com.geitus.app.catalog.listagem.ParametrosDaListagem;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

import jakarta.persistence.EntityManagerFactory;

/**
 * Listagem paginada de ponta a ponta no service, com o contexto Spring completo
 * e um PostgreSQL real (docs/modules/produtos-listagem.md, 5): as duas etapas
 * (ids da {@link ConsultaDeProdutos}, depois os produtos com as relacoes) na
 * mesma ordem, a categoria de outra empresa, a pagina alem do fim e o numero
 * constante de comandos SQL por pagina.
 *
 * <p>Sem {@code @Transactional} na classe: cada chamada de service abre e
 * confirma a propria transacao. Cada teste usa uma empresa nova. Requer Docker.
 */
@SpringBootTest
@Testcontainers
class ListagemDeProdutosIT {

    private static final AtomicInteger SEQUENCIA = new AtomicInteger();

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configurarDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.jpa.properties.hibernate.generate_statistics", () -> "true");
    }

    @Autowired
    private ProdutoService produtoService;

    @Autowired
    private UnidadeMedidaService unidadeService;

    @Autowired
    private CategoriaService categoriaService;

    @Autowired
    private EmpresaRepository empresaRepository;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    /** Spy (chama o real) para contar as chamadas da etapa 1; resetado apos cada teste. */
    @MockitoSpyBean
    private ConsultaDeProdutos consultaDeProdutos;

    @Test
    void listagemPreservaAOrdemDosIds() {
        Loja loja = novaLoja();
        cadastrar(loja, comUnidade(loja).nome("A barato").precoVenda("5.00"));
        cadastrar(loja, comUnidade(loja).nome("B caro").precoVenda("20.00"));
        cadastrar(loja, comUnidade(loja).nome("C medio").precoVenda("10.00"));

        assertThat(nomes(listar(loja, parametros(null, "-preco", 0, 25)))).containsExactly("B caro", "C medio",
                "A barato");
        assertThat(nomes(listar(loja, parametros(null, "preco", 0, 25)))).containsExactly("A barato", "C medio",
                "B caro");
    }

    @Test
    void buscaSemAcentoTrazOsProdutosComAsRelacoes() {
        Loja loja = novaLoja();
        UUID racao = categoria(loja, "Ração", null);
        UUID umida = categoria(loja, "Úmida", racao);
        cadastrar(loja, comUnidade(loja).nome("Açúcar Cristal União").categoriaId(umida).marca("União")
                .codigosBarras("7891000315507").estoqueInicial("4"));
        cadastrar(loja, comUnidade(loja).nome("Arroz"));

        PaginaResponse<ProdutoResponse> pagina = listar(loja, parametros("uniao acucar", null, 0, 25));

        assertThat(pagina.totalItens()).isEqualTo(1);
        assertThat(pagina.itens()).singleElement().satisfies(produto -> {
            assertThat(produto.categoria().caminho()).isEqualTo("Ração › Úmida");
            assertThat(produto.codigosBarras()).extracting(CodigoBarrasResponse::codigo)
                    .containsExactly("7891000315507");
            assertThat(produto.estoqueAtual()).isEqualByComparingTo("4");
            assertThat(produto.unidade().sigla()).isEqualTo("UN");
        });
    }

    /** Review Focus 1: busca so com espacos Unicode e listagem sem busca, sem erro. */
    @Test
    void buscaSoComEspacosUnicodeListaTudo() {
        Loja loja = novaLoja();
        cadastrar(loja, comUnidade(loja).nome("Arroz"));
        cadastrar(loja, comUnidade(loja).nome("Feijão"));

        assertThat(listar(loja, parametros("\u00a0\u2007 \u202f", null, 0, 25)).totalItens()).isEqualTo(2);
    }

    /** Review Focus 5: categoria de outra empresa ou inexistente nao revela nada e nao da erro. */
    @Test
    void categoriaDeOutraEmpresaRetornaVazio() {
        Loja loja = novaLoja();
        Loja outra = novaLoja();
        UUID daLoja = categoria(loja, "Bebidas", null);
        UUID daOutra = categoria(outra, "Bebidas", null);
        cadastrar(loja, comUnidade(loja).nome("Água").categoriaId(daLoja));
        cadastrar(outra, comUnidade(outra).nome("Água da outra").categoriaId(daOutra));

        PaginaResponse<ProdutoResponse> deOutraEmpresa = listar(loja, porCategoria(daOutra));
        PaginaResponse<ProdutoResponse> inexistente = listar(loja, porCategoria(UUID.randomUUID()));

        assertThat(deOutraEmpresa.itens()).isEmpty();
        assertThat(deOutraEmpresa.totalItens()).isZero();
        assertThat(inexistente.itens()).isEmpty();
        assertThat(nomes(listar(loja, porCategoria(daLoja)))).containsExactly("Água");
    }

    /** Review Focus 2: pagina alem do fim traz os itens vazios com o total real. */
    @Test
    void paginaAlemDoFimRetornaTotal() {
        Loja loja = novaLoja();
        for (int i = 1; i <= 3; i++) {
            cadastrar(loja, comUnidade(loja).nome("Produto " + i));
        }

        PaginaResponse<ProdutoResponse> pagina = listar(loja, parametros(null, null, 5, 2));

        assertThat(pagina.itens()).isEmpty();
        assertThat(pagina.totalItens()).isEqualTo(3);
        assertThat(pagina.pagina()).isEqualTo(5);
        assertThat(pagina.tamanho()).isEqualTo(2);
    }

    /**
     * Spec 5: o numero de comandos por pagina e constante. Conta os comandos do
     * Hibernate (usuario, arvore de categorias, produtos com as relacoes e os
     * resumos de estoque) pelas estatisticas e confere que a etapa 1 (contagem
     * e ids, via JDBC) e chamada uma unica vez: a pagina com 3 itens e a com 25
     * executam o mesmo numero de comandos.
     */
    @Test
    void numeroDeConsultasConstante() {
        Loja loja = novaLoja();
        UUID racao = categoria(loja, "Ração", null);
        for (int i = 1; i <= 30; i++) {
            ProdutoRequestBuilder produto = comUnidade(loja).nome(String.format("Produto %02d", i))
                    .codigosBarras("COD-" + i, "ALT-" + i);
            if (i % 2 == 0) {
                produto.categoriaId(racao).estoqueInicial(String.valueOf(i));
            }
            cadastrar(loja, produto);
        }

        long comandosComTres = comandosAoListar(loja, 3);
        long comandosComVinteECinco = comandosAoListar(loja, 25);

        assertThat(comandosComVinteECinco).isEqualTo(comandosComTres);
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private record Loja(Long admin, List<UnidadeMedidaResponse> unidades) {
    }

    private long comandosAoListar(Loja loja, int tamanho) {
        Statistics estatisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        clearInvocations(consultaDeProdutos);
        estatisticas.clear();

        PaginaResponse<ProdutoResponse> pagina = listar(loja, parametros(null, null, 0, tamanho));

        long comandos = estatisticas.getPrepareStatementCount();
        assertThat(pagina.itens()).hasSize(tamanho);
        verify(consultaDeProdutos, times(1)).buscar(any(), any(), anyInt(), anyInt());
        return comandos;
    }

    private static ParametrosDaListagem parametros(String busca, String ordem, int pagina, int tamanho) {
        return ParametrosDaListagem.daRequisicao(busca, null, null, null, null, ordem, pagina, tamanho);
    }

    private static ParametrosDaListagem porCategoria(UUID categoria) {
        return ParametrosDaListagem.daRequisicao(null, null, categoria, null, null, null, 0, 25);
    }

    private PaginaResponse<ProdutoResponse> listar(Loja loja, ParametrosDaListagem parametros) {
        return produtoService.listarParaUsuario(loja.admin(), parametros);
    }

    private static List<String> nomes(PaginaResponse<ProdutoResponse> pagina) {
        return pagina.itens().stream().map(ProdutoResponse::nome).toList();
    }

    private void cadastrar(Loja loja, ProdutoRequestBuilder produto) {
        produtoService.cadastrarParaUsuario(loja.admin(), produto.build());
    }

    private static ProdutoRequestBuilder comUnidade(Loja loja) {
        UUID un = loja.unidades().stream()
                .filter(unidade -> unidade.sigla().equals("UN"))
                .map(UnidadeMedidaResponse::id)
                .findFirst()
                .orElseThrow();
        return ProdutoRequestBuilder.comUnidade(un);
    }

    private UUID categoria(Loja loja, String nome, UUID pai) {
        return categoriaService.cadastrarParaUsuario(loja.admin(), new CategoriaRequest(nome, pai)).id();
    }

    /** Empresa FISICA (sem CNPJ) com as unidades padrao e um ADMIN; nome unico por teste. */
    private Loja novaLoja() {
        String sufixo = String.valueOf(SEQUENCIA.incrementAndGet());
        String nome = "Empresa Listagem " + sufixo;
        Empresa empresa = new Empresa(nome);
        empresa.atualizarCadastro(nome, "1133224455", "contato" + sufixo + "@listagem.test", TipoPessoa.FISICA, null,
                null, null,
                new RepresentanteLegal("Representante " + sufixo, "11144477735", "11987654321",
                        "rep" + sufixo + "@listagem.test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        Empresa gravada = empresaRepository.saveAndFlush(empresa);
        unidadeService.criarPadroes(gravada);
        Long admin = usuarioRepository.saveAndFlush(new Usuario(gravada, "Admin",
                "admin" + SEQUENCIA.incrementAndGet() + "@listagem.test", "hash-irrelevante-no-teste", "ADMIN"))
                .getId();
        return new Loja(admin, unidadeService.listarParaUsuario(admin, null));
    }
}
