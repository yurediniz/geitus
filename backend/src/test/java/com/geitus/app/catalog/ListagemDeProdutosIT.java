package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Predicate;
import java.util.stream.Collectors;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.categoria.CategoriaService;
import com.geitus.app.catalog.categoria.dto.CategoriaRequest;
import com.geitus.app.catalog.dto.CodigoBarrasResponse;
import com.geitus.app.catalog.dto.EmbalagemRequest;
import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.imagem.ImagemDoProduto;
import com.geitus.app.catalog.imagem.ImagensDeTeste;
import com.geitus.app.catalog.imagem.ImagensDoProduto;
import com.geitus.app.catalog.listagem.ConsultaDeProdutos;
import com.geitus.app.catalog.listagem.ParametrosDaListagem;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.iam.JwtService;
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
@AutoConfigureMockMvc
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

    @Autowired
    private Clock relogio;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private ImagensDoProduto imagensDoProduto;

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
        cadastrar(loja, comUnidade(loja).nome("Açúcar Cristal União").categoriaId(umida)
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
     * Spec 5: o numero de comandos por pagina e constante, sem e com busca,
     * categoria e estoque. Conta os comandos do Hibernate (usuario, arvore de
     * categorias, produtos com as relacoes e os resumos de estoque) pelas
     * estatisticas e confere que a etapa 1 (contagem e ids, via JDBC) e chamada
     * uma unica vez: a pagina com 3 itens e a com 25 executam o mesmo numero
     * de comandos. Fase B3: cada produto tem duas embalagens com codigos, que
     * tambem nao podem gerar uma consulta por produto.
     */
    @Test
    void numeroDeConsultasConstante() {
        Loja loja = novaLoja();
        UUID racao = categoria(loja, "Ração", null);
        UUID umida = categoria(loja, "Úmida", racao);
        UUID cx = unidade(loja, "CX");
        UUID fd = unidade(loja, "FD");
        for (int i = 1; i <= 30; i++) {
            cadastrar(loja, comUnidade(loja).nome(String.format("Produto %02d", i))
                    .codigosBarras("COD-" + i, "ALT-" + i).categoriaId(i % 2 == 0 ? racao : umida)
                    .pontoReposicao("100").estoqueInicial(String.valueOf(i))
                    .embalagens(new EmbalagemRequest(null, cx, new BigDecimal("12"), null, false,
                                    List.of("CX-" + i)),
                            new EmbalagemRequest(null, fd, new BigDecimal("24"), new BigDecimal("200.00"), true,
                                    List.of("FD-" + i, "FD2-" + i))));
        }
        ParametrosDaListagem semFiltro = parametros(null, null, 0, 25);
        ParametrosDaListagem comFiltros = ParametrosDaListagem.daRequisicao("produto", null, racao, "baixo", null,
                null, 0, 25);

        for (ParametrosDaListagem parametros : List.of(semFiltro, comFiltros)) {
            long comandosComTres = comandosAoListar(loja, comTamanho(parametros, 3));
            long comandosComVinteECinco = comandosAoListar(loja, comTamanho(parametros, 25));

            assertThat(comandosComVinteECinco).as("busca %s", parametros.busca()).isEqualTo(comandosComTres);
        }
    }

    /**
     * Fase F (docs/modules/produtos-imagem.md, 4.3 e 8): as imagens da pagina
     * vem numa consulta so, sem os bytes. A pagina com 3 itens e a com 25
     * executam o mesmo numero de comandos, com e sem imagens; sem imagem, o
     * campo {@code imagem} vem nulo.
     */
    @Test
    void numeroDeConsultasConstanteComImagens() {
        Loja semImagens = novaLoja();
        Loja comImagens = novaLoja();
        for (int i = 1; i <= 30; i++) {
            cadastrar(semImagens, comUnidade(semImagens).nome(String.format("Produto %02d", i)));
            UUID produto = produtoService.cadastrarParaUsuario(comImagens.admin(),
                    comUnidade(comImagens).nome(String.format("Produto %02d", i)).build()).id();
            if (i % 2 == 0) {
                enviarImagem(comImagens, produto);
            }
        }
        ParametrosDaListagem tres = parametros(null, null, 0, 3);
        ParametrosDaListagem vinteECinco = parametros(null, null, 0, 25);

        long semImagensComTres = comandosAoListar(semImagens, tres);
        long semImagensComVinteECinco = comandosAoListar(semImagens, vinteECinco);
        long comImagensComTres = comandosAoListar(comImagens, tres);
        long comImagensComVinteECinco = comandosAoListar(comImagens, vinteECinco);

        assertThat(semImagensComVinteECinco).isEqualTo(semImagensComTres);
        assertThat(comImagensComVinteECinco).isEqualTo(comImagensComTres);
        assertThat(comImagensComTres).isEqualTo(semImagensComTres);
        List<ProdutoResponse> itens = listar(comImagens, vinteECinco).itens();
        assertThat(itens).filteredOn(produto -> produto.imagem() != null).hasSize(12);
        assertThat(itens).filteredOn(produto -> produto.nome().equals("Produto 01")).singleElement()
                .satisfies(produto -> assertThat(produto.imagem()).isNull());
        assertThat(itens).filteredOn(produto -> produto.nome().equals("Produto 02")).singleElement()
                .satisfies(produto -> {
                    assertThat(produto.imagem().miniaturaUrl())
                            .startsWith("/api/imagens/produtos/" + produto.id() + "/");
                    assertThat(produto.imagem().largura()).isEqualTo(1200);
                    assertThat(produto.imagem().altura()).isEqualTo(900);
                });
    }

    /**
     * Fase F: listar e ler o detalhe nunca carregam a entidade
     * {@link ImagemDoProduto} (que traria os bytes); so as projecoes do resumo.
     */
    @Test
    void listagemEDetalheNaoCarregamAEntidadeDaImagem() {
        Loja loja = novaLoja();
        UUID produto = produtoService.cadastrarParaUsuario(loja.admin(), comUnidade(loja).nome("Com imagem").build())
                .id();
        enviarImagem(loja, produto);
        Statistics estatisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        estatisticas.clear();

        ProdutoResponse listado = listar(loja, parametros(null, null, 0, 25)).itens().get(0);
        ProdutoResponse detalhe = produtoService.buscarPorIdParaUsuario(loja.admin(), produto);

        assertThat(listado.imagem()).isNotNull();
        assertThat(detalhe.imagem()).isNotNull();
        assertThat(estatisticas.getEntityStatistics(ImagemDoProduto.class.getName()).getLoadCount()).isZero();
        assertThat(estatisticas.getEntityStatistics(ImagemDoProduto.class.getName()).getFetchCount()).isZero();
    }

    /**
     * Os filtros de estoque e de promocao do SQL casam exatamente com os selos
     * calculados em Java na resposta ({@code SituacaoEstoque},
     * {@code SituacaoPromocao}), nos dois sentidos.
     */
    @Test
    void filtrosDeEstoqueEPromocaoCoincidemComOsSelosDaResposta() {
        Loja loja = novaLoja();
        LocalDate hoje = SituacaoPromocao.hoje(relogio);
        cadastrar(loja, comUnidade(loja).nome("No ponto").estoqueMinimo("5").pontoReposicao("10")
                .estoqueInicial("10"));
        cadastrar(loja, comUnidade(loja).nome("No minimo sem ponto").estoqueMinimo("5").estoqueInicial("5"));
        cadastrar(loja, comUnidade(loja).nome("Zerado"));
        cadastrar(loja, comUnidade(loja).nome("Acima do ponto").pontoReposicao("10").estoqueInicial("11"));
        cadastrar(loja, comUnidade(loja).nome("Sem controle").controlaEstoque(false));
        cadastrar(loja, comUnidade(loja).nome("Promo comeca hoje").estoqueInicial("50")
                .promocao("8.00", hoje, hoje.plusDays(3)));
        cadastrar(loja, comUnidade(loja).nome("Promo termina hoje").estoqueInicial("50")
                .promocao("8.00", hoje.minusDays(3), hoje));
        cadastrar(loja, comUnidade(loja).nome("Promo comeca amanha").estoqueInicial("50")
                .promocao("8.00", hoje.plusDays(1), hoje.plusDays(3)));
        List<ProdutoResponse> todos = listar(loja, porFiltro(null, null)).itens();

        Set<String> baixoPelosSelos = nomesQue(todos, produto -> produto.situacaoEstoque() == SituacaoEstoque.BAIXO
                || produto.situacaoEstoque() == SituacaoEstoque.SEM_ESTOQUE);
        Set<String> semPelosSelos = nomesQue(todos,
                produto -> produto.situacaoEstoque() == SituacaoEstoque.SEM_ESTOQUE);
        Set<String> promocaoPelosSelos = nomesQue(todos, ProdutoResponse::emPromocao);

        assertThat(todos).hasSize(8);
        assertThat(baixoPelosSelos).containsExactlyInAnyOrder("No ponto", "No minimo sem ponto", "Zerado");
        assertThat(semPelosSelos).containsExactly("Zerado");
        assertThat(promocaoPelosSelos).containsExactlyInAnyOrder("Promo comeca hoje", "Promo termina hoje");
        assertThat(nomes(listar(loja, porFiltro("baixo", null)))).containsExactlyInAnyOrderElementsOf(baixoPelosSelos);
        assertThat(nomes(listar(loja, porFiltro("sem", null)))).containsExactlyInAnyOrderElementsOf(semPelosSelos);
        assertThat(nomes(listar(loja, porFiltro(null, "true"))))
                .containsExactlyInAnyOrderElementsOf(promocaoPelosSelos);
    }

    /** Termo so com marca combinante: nao lanca, busca so por codigo e nao acha nada. */
    @Test
    void buscaSoComMarcaCombinanteNaoLancaEDaTotalZero() {
        Loja loja = novaLoja();
        cadastrar(loja, comUnidade(loja).nome("Feijão").codigosBarras("7891000315507"));

        PaginaResponse<ProdutoResponse> pagina = listar(loja, parametros("\u0301", null, 0, 25));

        assertThat(pagina.itens()).isEmpty();
        assertThat(pagina.totalItens()).isZero();
    }

    /**
     * Pela API real (filtro JWT, controller e banco): NUL na busca nunca vira
     * erro do PostgreSQL (409/500) e caracteres invisiveis colados nao atrapalham.
     */
    @Test
    void buscaComCaracteresInvisiveisPelaApi() throws Exception {
        Loja loja = novaLoja();
        cadastrar(loja, comUnidade(loja).nome("Arroz"));
        cadastrar(loja, comUnidade(loja).nome("Feijão"));
        String token = "Bearer " + jwtService.gerarToken(usuarioRepository.findById(loja.admin()).orElseThrow());

        mockMvc.perform(get("/api/produtos").param("busca", "\u0000").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(2));
        mockMvc.perform(get("/api/produtos").param("busca", "arroz\u200b").header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(1))
                .andExpect(jsonPath("$.itens[0].nome").value("Arroz"));
    }

    /** Fase B2 de ponta a ponta: "0542" acha pelo codigo e "1" pelo numero de registro. */
    @Test
    void buscaPorCodigoComZerosEPeloNumero() {
        Loja loja = novaLoja();
        cadastrar(loja, comUnidade(loja).nome("Açúcar a granel"));
        cadastrar(loja, comUnidade(loja).nome("Feijão a granel").codigoDoProduto(542));

        assertThat(nomes(listar(loja, parametros("0542", null, 0, 25)))).containsExactly("Feijão a granel");
        assertThat(nomes(listar(loja, parametros("1", null, 0, 25)))).containsExactly("Açúcar a granel");
        assertThat(listar(loja, parametros("000542", null, 0, 25)).itens())
                .singleElement()
                .satisfies(produto -> {
                    assertThat(produto.numero()).isEqualTo(2L);
                    assertThat(produto.codigo()).isEqualTo(542);
                });
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private record Loja(Long admin, List<UnidadeMedidaResponse> unidades) {
    }

    private long comandosAoListar(Loja loja, ParametrosDaListagem parametros) {
        Statistics estatisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        clearInvocations(consultaDeProdutos);
        estatisticas.clear();

        PaginaResponse<ProdutoResponse> pagina = listar(loja, parametros);

        long comandos = estatisticas.getPrepareStatementCount();
        assertThat(pagina.itens()).hasSize(parametros.tamanho());
        verify(consultaDeProdutos, times(1)).buscar(any(), any(), anyInt(), anyInt());
        return comandos;
    }

    private static ParametrosDaListagem parametros(String busca, String ordem, int pagina, int tamanho) {
        return ParametrosDaListagem.daRequisicao(busca, null, null, null, null, ordem, pagina, tamanho);
    }

    private static ParametrosDaListagem comTamanho(ParametrosDaListagem base, int tamanho) {
        return new ParametrosDaListagem(base.busca(), base.status(), base.categoria(), base.estoque(),
                base.emPromocao(), base.ordem(), 0, tamanho);
    }

    /** Todos os status, com o filtro de estoque e/ou de promocao. */
    private static ParametrosDaListagem porFiltro(String estoque, String promocao) {
        return ParametrosDaListagem.daRequisicao(null, "todos", null, estoque, promocao, null, 0, 100);
    }

    private static Set<String> nomesQue(List<ProdutoResponse> produtos, Predicate<ProdutoResponse> condicao) {
        return produtos.stream().filter(condicao).map(ProdutoResponse::nome).collect(Collectors.toSet());
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

    private void enviarImagem(Loja loja, UUID produto) {
        imagensDoProduto.enviar(loja.admin(), produto,
                new MockMultipartFile("grande", ImagensDeTeste.webpVp8(1200, 900)),
                new MockMultipartFile("miniatura", ImagensDeTeste.webpVp8(200, 150)));
    }

    private void cadastrar(Loja loja, ProdutoRequestBuilder produto) {
        produtoService.cadastrarParaUsuario(loja.admin(), produto.build());
    }

    private static ProdutoRequestBuilder comUnidade(Loja loja) {
        return ProdutoRequestBuilder.comUnidade(unidade(loja, "UN"));
    }

    private static UUID unidade(Loja loja, String sigla) {
        return loja.unidades().stream()
                .filter(unidade -> unidade.sigla().equals(sigla))
                .map(UnidadeMedidaResponse::id)
                .findFirst()
                .orElseThrow();
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
