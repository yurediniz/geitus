package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.categoria.CategoriaService;
import com.geitus.app.catalog.categoria.dto.CategoriaRequest;
import com.geitus.app.catalog.categoria.dto.CategoriaResponse;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.catalog.unidade.UnidadesPadrao;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Teste de integracao dos services do catalogo (unidades, categorias e
 * produto) com o contexto Spring completo e um PostgreSQL real
 * (Testcontainers, Flyway com as migrations de producao).
 *
 * <p>Cobre o que os testes com mock nao alcancam: as transacoes reais dos
 * metodos {@code *ParaUsuario} (com {@code open-in-view: false}, os vinculos
 * LAZY do produto precisam ser lidos dentro do service) e a trava por empresa
 * que serializa mover categorias, provada com duas threads concorrentes.
 *
 * <p>Sem {@code @Transactional} na classe de proposito: cada chamada de service
 * abre e confirma a propria transacao, como em producao. Cada teste usa uma
 * empresa nova, entao nao ha limpeza entre testes. Requer Docker.
 */
@SpringBootTest
@Testcontainers
class CatalogoServiceIT {

    /** Rodadas do teste concorrente: sem a trava, ao menos uma costuma gerar o ciclo. */
    private static final int RODADAS_CONCORRENTES = 10;
    private static final long ESPERA_MAXIMA_SEGUNDOS = 30;
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
    }

    @Autowired
    private EmpresaRepository empresaRepository;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private UnidadeMedidaService unidadeService;

    @Autowired
    private CategoriaService categoriaService;

    @Autowired
    private ProdutoService produtoService;

    // ---------- Fluxo completo ----------

    @Test
    void fluxoCompletoComBancoReal() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);

        unidadeService.criarPadroes(empresa);
        List<UnidadeMedidaResponse> unidades = unidadeService.listarParaUsuario(idUsuario, null);
        assertThat(unidades).extracting(UnidadeMedidaResponse::sigla)
                .containsExactlyInAnyOrderElementsOf(
                        UnidadesPadrao.TODAS.stream().map(UnidadesPadrao.UnidadePadrao::sigla).toList())
                .hasSize(10);

        UUID racao = cadastrarCategoria(idUsuario, "Ração", null);
        UUID umida = cadastrarCategoria(idUsuario, "Úmida", racao);
        UUID sache = cadastrarCategoria(idUsuario, "Sachê", umida);

        ProdutoResponse cadastrado = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(siglaParaUuid(unidades, "KG"))
                        .nome("Sachê de frango")
                        .categoriaId(sache)
                        .compra(siglaParaUuid(unidades, "CX"), "12")
                        .build());

        List<ProdutoResponse> listados = produtoService.listarParaUsuario(idUsuario, null, null);
        assertThat(listados).singleElement().satisfies(CatalogoServiceIT::vinculosDoSacheResolvidos);
        vinculosDoSacheResolvidos(produtoService.buscarPorIdParaUsuario(idUsuario, cadastrado.id()));
    }

    private static void vinculosDoSacheResolvidos(ProdutoResponse produto) {
        assertThat(produto.nome()).isEqualTo("Sachê de frango");
        assertThat(produto.unidade().sigla()).isEqualTo("KG");
        assertThat(produto.unidadeCompra().sigla()).isEqualTo("CX");
        assertThat(produto.categoria().caminho()).isEqualTo("Ração › Úmida › Sachê");
        assertThat(produto.conversaoTexto()).isEqualTo("1 CX = 12 KG");
    }

    // ---------- Edicao com vinculos inativados depois do cadastro ----------

    /**
     * Regra "manter o vinculo atual mesmo inativo" (spec 5.1) com proxies LAZY
     * reais: o produto carregado na transacao do service compara o id da
     * unidade/categoria escolhida com o do proxy atual. Trocar para OUTRA
     * unidade inativa continua bloqueado.
     */
    @Test
    void editarProdutoComUnidadeECategoriaInativadasMantemVinculos() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        unidadeService.criarPadroes(empresa);
        List<UnidadeMedidaResponse> unidades = unidadeService.listarParaUsuario(idUsuario, null);
        UUID kg = siglaParaUuid(unidades, "KG");
        UUID cx = siglaParaUuid(unidades, "CX");
        UUID g = siglaParaUuid(unidades, "G");
        UUID racao = cadastrarCategoria(idUsuario, "Ração", null);
        UUID umida = cadastrarCategoria(idUsuario, "Úmida", racao);
        ProdutoResponse cadastrado = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(kg).nome("Patê de carne").categoriaId(umida).compra(cx, "12")
                        .build());

        unidadeService.inativarParaUsuario(idUsuario, kg);
        unidadeService.inativarParaUsuario(idUsuario, cx);
        unidadeService.inativarParaUsuario(idUsuario, g);
        categoriaService.inativarParaUsuario(idUsuario, racao);

        ProdutoResponse editado = produtoService.atualizarDadosBasicosParaUsuario(idUsuario, cadastrado.id(),
                ProdutoRequestBuilder.comUnidade(kg).nome("Patê de carne 400g").categoriaId(umida)
                        .compra(cx, "12").build());

        assertThat(editado.nome()).isEqualTo("Patê de carne 400g");
        assertThat(editado.unidade().sigla()).isEqualTo("KG");
        assertThat(editado.unidadeCompra().sigla()).isEqualTo("CX");
        assertThat(editado.categoria().caminho()).isEqualTo("Ração › Úmida");

        assertThatThrownBy(() -> produtoService.atualizarDadosBasicosParaUsuario(idUsuario, cadastrado.id(),
                ProdutoRequestBuilder.comUnidade(g).nome("Patê de carne 400g").categoriaId(umida)
                        .compra(cx, "12").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Esta unidade está inativa. Escolha uma unidade ativa.");
        assertThat(produtoService.buscarPorIdParaUsuario(idUsuario, cadastrado.id()).unidade().sigla())
                .isEqualTo("KG");
    }

    // ---------- Concorrencia: trava por empresa ao mover ----------

    /**
     * "Mover A para dentro de B" e "mover B para dentro de A" ao mesmo tempo:
     * sem a trava por empresa, as duas leem a arvore sem ciclo, as duas gravam
     * e a arvore fica com A sob B e B sob A. Com a trava, exatamente uma
     * conclui e a outra recebe 400 (ciclo). Repetido em varias rodadas para
     * dar chance real a corrida.
     */
    @Test
    void moverCruzadoConcorrenteNaoCriaCiclo() throws Exception {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            for (int rodada = 1; rodada <= RODADAS_CONCORRENTES; rodada++) {
                UUID categoriaA = cadastrarCategoria(idUsuario, "A" + rodada, null);
                UUID categoriaB = cadastrarCategoria(idUsuario, "B" + rodada, null);
                CyclicBarrier largada = new CyclicBarrier(2);

                Future<Boolean> aParaB = executor.submit(
                        moverAoMesmoTempo(largada, idUsuario, categoriaA, "A" + rodada, categoriaB));
                Future<Boolean> bParaA = executor.submit(
                        moverAoMesmoTempo(largada, idUsuario, categoriaB, "B" + rodada, categoriaA));

                List<Boolean> concluidas = List.of(
                        aParaB.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS),
                        bParaA.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS));
                assertThat(concluidas).as("rodada %d: exatamente um movimento conclui", rodada)
                        .containsExactlyInAnyOrder(true, false);
                assertThatCode(() -> categoriaService.listarParaUsuario(idUsuario, null))
                        .as("rodada %d: arvore sem ciclo", rodada)
                        .doesNotThrowAnyException();
            }
        } finally {
            executor.shutdownNow();
        }

        List<CategoriaResponse> categorias = categoriaService.listarParaUsuario(idUsuario, null);
        long naRaiz = categorias.stream().filter(categoria -> categoria.parentId() == null).count();
        assertThat(naRaiz).isEqualTo(RODADAS_CONCORRENTES);
        assertThat(categorias).hasSize(2 * RODADAS_CONCORRENTES);
    }

    /** Move {@code id} para dentro de {@code novoPai}; {@code true} se concluiu, {@code false} se ciclo. */
    private Callable<Boolean> moverAoMesmoTempo(CyclicBarrier largada, Long idUsuario, UUID id, String nome,
            UUID novoPai) {
        return () -> {
            largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
            try {
                categoriaService.atualizarParaUsuario(idUsuario, id, new CategoriaRequest(nome, novoPai));
                return true;
            } catch (RegraDeNegocioException ciclo) {
                return false;
            }
        };
    }

    // ---------- Apoio ----------

    private UUID cadastrarCategoria(Long idUsuario, String nome, UUID pai) {
        return categoriaService.cadastrarParaUsuario(idUsuario, new CategoriaRequest(nome, pai)).id();
    }

    private static UUID siglaParaUuid(List<UnidadeMedidaResponse> unidades, String sigla) {
        return unidades.stream()
                .filter(unidade -> unidade.sigla().equals(sigla))
                .map(UnidadeMedidaResponse::id)
                .findFirst()
                .orElseThrow();
    }

    /** Empresa FISICA (sem CNPJ), como no {@code ProdutoRepositoryIT}; nome unico por teste. */
    private Empresa novaEmpresa() {
        String sufixo = String.valueOf(SEQUENCIA.incrementAndGet());
        String nome = "Empresa Catalogo " + sufixo;
        Empresa empresa = new Empresa(nome);
        empresa.atualizarCadastro(
                nome,
                "1133224455",
                "contato" + sufixo + "@catalogo.test",
                TipoPessoa.FISICA,
                null,
                null,
                null,
                new RepresentanteLegal("Representante " + sufixo, "11144477735", "11987654321",
                        "rep" + sufixo + "@catalogo.test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        return empresaRepository.saveAndFlush(empresa);
    }

    private Long novoAdmin(Empresa empresa) {
        Usuario admin = new Usuario(empresa, "Admin", "admin" + SEQUENCIA.incrementAndGet() + "@catalogo.test",
                "hash-irrelevante-no-teste", "ADMIN");
        return usuarioRepository.saveAndFlush(admin).getId();
    }
}
