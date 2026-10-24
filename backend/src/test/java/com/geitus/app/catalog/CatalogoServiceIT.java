package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mockingDetails;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.LongStream;

import org.junit.jupiter.api.Test;
import org.mockito.stubbing.Answer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.categoria.CategoriaService;
import com.geitus.app.catalog.categoria.dto.CategoriaRequest;
import com.geitus.app.catalog.categoria.dto.CategoriaResponse;
import com.geitus.app.catalog.dto.CodigoBarrasResponse;
import com.geitus.app.catalog.dto.HistoricoPrecoResponse;
import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.listagem.ParametrosDaListagem;
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
 * que serializa mover categorias, provada com duas threads concorrentes. Na
 * Fase B, cobre os codigos de barras contra as constraints reais da V7
 * (reordenar, codigo migrado como OUTRO, unicidade por empresa) e a exclusao
 * com cascade, conferidos via JDBC.
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
    /** Garante relogio distinto entre dois carimbos seguidos de {@code atualizado_em}. */
    private static final long INTERVALO_ENTRE_CARIMBOS_MS = 5;
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

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** Spy (chama o real por padrao) para simular falha ao gravar o historico; resetado apos cada teste. */
    @MockitoSpyBean
    private HistoricoPrecoRepository historicoPrecoRepository;

    /** Spy (chama o real por padrao) para simular a checagem do codigo antes de um cadastro simultaneo. */
    @MockitoSpyBean
    private ProdutoRepository produtoRepository;

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
                        .build());

        List<ProdutoResponse> listados = produtoService.listarParaUsuario(idUsuario,
                ParametrosDaListagem.daRequisicao(null, null, null, null, null, null, 0, 25)).itens();
        assertThat(listados).singleElement().satisfies(CatalogoServiceIT::vinculosDoSacheResolvidos);
        vinculosDoSacheResolvidos(produtoService.buscarPorIdParaUsuario(idUsuario, cadastrado.id()));
    }

    private static void vinculosDoSacheResolvidos(ProdutoResponse produto) {
        assertThat(produto.nome()).isEqualTo("Sachê de frango");
        assertThat(produto.unidade().sigla()).isEqualTo("KG");
        assertThat(produto.categoria().caminho()).isEqualTo("Ração › Úmida › Sachê");
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
                ProdutoRequestBuilder.comUnidade(kg).nome("Patê de carne").categoriaId(umida).build());

        unidadeService.inativarParaUsuario(idUsuario, kg);
        unidadeService.inativarParaUsuario(idUsuario, cx);
        unidadeService.inativarParaUsuario(idUsuario, g);
        categoriaService.inativarParaUsuario(idUsuario, racao);

        ProdutoResponse editado = produtoService.atualizarDadosBasicosParaUsuario(idUsuario, cadastrado.id(),
                ProdutoRequestBuilder.comUnidade(kg).nome("Patê de carne 400g").categoriaId(umida).build());

        assertThat(editado.nome()).isEqualTo("Patê de carne 400g");
        assertThat(editado.unidade().sigla()).isEqualTo("KG");
        assertThat(editado.categoria().caminho()).isEqualTo("Ração › Úmida");

        assertThatThrownBy(() -> produtoService.atualizarDadosBasicosParaUsuario(idUsuario, cadastrado.id(),
                ProdutoRequestBuilder.comUnidade(g).nome("Patê de carne 400g").categoriaId(umida).build()))
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

    // ---------- Fase B: codigos de barras e exclusao com banco real ----------

    /**
     * Review Focus 1: produto migrado com EAN-13 de digito invalido (gravado
     * {@code OUTRO} pela V7) e editado sem mexer no codigo — salva e o codigo
     * continua {@code OUTRO}, na mesma linha. Um codigo NOVO com digito
     * invalido continua bloqueado.
     */
    @Test
    void produtoComCodigoOutroMigradoEditadoSemMudar() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        ProdutoResponse cadastrado = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Feijão").build());
        jdbcTemplate.update("""
                INSERT INTO produto_codigos_barras (empresa_id, produto_id, codigo, formato, ordem)
                SELECT empresa_id, id, '7891000315508', 'OUTRO', 0 FROM produtos WHERE uuid = ?
                """, cadastrado.id());
        Long linhaMigrada = idDoCodigo(cadastrado.id(), "7891000315508");

        ProdutoResponse editado = produtoService.atualizarDadosBasicosParaUsuario(idUsuario, cadastrado.id(),
                ProdutoRequestBuilder.comUnidade(un).nome("Feijão carioca 1kg").codigosBarras("7891000315508")
                        .build());

        assertThat(editado.nome()).isEqualTo("Feijão carioca 1kg");
        assertThat(editado.codigosBarras())
                .containsExactly(new CodigoBarrasResponse("7891000315508", FormatoCodigoBarras.OUTRO));
        assertThat(idDoCodigo(cadastrado.id(), "7891000315508")).isEqualTo(linhaMigrada);
        assertThatThrownBy(() -> produtoService.atualizarDadosBasicosParaUsuario(idUsuario, cadastrado.id(),
                ProdutoRequestBuilder.comUnidade(un).nome("Feijão carioca 1kg")
                        .codigosBarras("7891000315508", "96385075").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Código de barras 96385075 com dígito verificador inválido. Confira a leitura.");
    }

    /** I2 do data-reviewer: inverter a ordem de 2 codigos via PATCH nao viola uq_codigo_barras_empresa. */
    @Test
    void patchInvertendoAOrdemDeDoisCodigosPreservaLinhasEFormatos() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        ProdutoResponse cadastrado = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Arroz").codigosBarras("7891000315507", "ABC-1").build());
        Long linhaEan = idDoCodigo(cadastrado.id(), "7891000315507");
        Long linhaOutro = idDoCodigo(cadastrado.id(), "ABC-1");

        ProdutoResponse editado = produtoService.atualizarDadosBasicosParaUsuario(idUsuario, cadastrado.id(),
                ProdutoRequestBuilder.comUnidade(un).nome("Arroz").codigosBarras("ABC-1", "7891000315507").build());

        assertThat(editado.codigosBarras()).containsExactly(
                new CodigoBarrasResponse("ABC-1", FormatoCodigoBarras.OUTRO),
                new CodigoBarrasResponse("7891000315507", FormatoCodigoBarras.EAN13));
        assertThat(produtoService.buscarPorIdParaUsuario(idUsuario, cadastrado.id()).codigosBarras())
                .extracting(CodigoBarrasResponse::codigo).containsExactly("ABC-1", "7891000315507");
        assertThat(idDoCodigo(cadastrado.id(), "ABC-1")).isEqualTo(linhaOutro);
        assertThat(idDoCodigo(cadastrado.id(), "7891000315507")).isEqualTo(linhaEan);
    }

    /**
     * Mudar so a ordem dos codigos carimba {@code atualizado_em} (os codigos
     * ficam em outra tabela; sem o carimbo o produto nao ficaria sujo) e a
     * resposta do PATCH ja traz o valor gravado no banco.
     */
    @Test
    void patchQueSoReordenaCodigosAtualizaOCarimboEARespostaTrazOGravado() throws InterruptedException {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        ProdutoResponse cadastrado = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Arroz").codigosBarras("7891000315507", "ABC-1").build());
        ProdutoResponse primeiraEdicao = produtoService.atualizarDadosBasicosParaUsuario(idUsuario, cadastrado.id(),
                ProdutoRequestBuilder.comUnidade(un).nome("Arroz 5kg").codigosBarras("7891000315507", "ABC-1")
                        .build());
        assertThat(primeiraEdicao.atualizadoEm()).isNotNull();
        TimeUnit.MILLISECONDS.sleep(INTERVALO_ENTRE_CARIMBOS_MS);

        ProdutoResponse reordenado = produtoService.atualizarDadosBasicosParaUsuario(idUsuario, cadastrado.id(),
                ProdutoRequestBuilder.comUnidade(un).nome("Arroz 5kg").codigosBarras("ABC-1", "7891000315507")
                        .build());

        assertThat(reordenado.atualizadoEm()).isAfter(primeiraEdicao.atualizadoEm());
        assertThat(reordenado.atualizadoEm()).isCloseTo(atualizadoEmGravado(cadastrado.id()),
                within(1, ChronoUnit.MICROS));
        assertThat(reordenado.codigosBarras()).extracting(CodigoBarrasResponse::codigo)
                .containsExactly("ABC-1", "7891000315507");
    }

    /** Decisao do CTO: PATCH sem {@code codigosBarras} mantem os codigos; {@code []} remove todos. */
    @Test
    void patchSemCodigosMantemEComListaVaziaRemove() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        ProdutoResponse cadastrado = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Feijão").codigosBarras("96385074", "FEIJAO-1").build());
        Long idInterno = idInternoDoProduto(cadastrado.id());

        ProdutoResponse semCampo = produtoService.atualizarDadosBasicosParaUsuario(idUsuario, cadastrado.id(),
                ProdutoRequestBuilder.comUnidade(un).nome("Feijão 1kg").codigosBarras((List<String>) null).build());

        assertThat(semCampo.nome()).isEqualTo("Feijão 1kg");
        assertThat(semCampo.codigosBarras()).extracting(CodigoBarrasResponse::codigo)
                .containsExactly("96385074", "FEIJAO-1");
        assertThat(codigosDoProduto(idInterno)).isEqualTo(2);

        ProdutoResponse listaVazia = produtoService.atualizarDadosBasicosParaUsuario(idUsuario, cadastrado.id(),
                ProdutoRequestBuilder.comUnidade(un).nome("Feijão 1kg").codigosBarras(List.of()).build());

        assertThat(listaVazia.codigosBarras()).isEmpty();
        assertThat(codigosDoProduto(idInterno)).isZero();
    }

    /** Review Focus 3: o mesmo codigo em outra empresa e permitido; na mesma, 409 com o nome. */
    @Test
    void codigoDuplicadoSoConflitaNaMesmaEmpresa() {
        Empresa empresaA = novaEmpresa();
        Long adminA = novoAdmin(empresaA);
        Empresa empresaB = novaEmpresa();
        Long adminB = novoAdmin(empresaB);
        produtoService.cadastrarParaUsuario(adminA, ProdutoRequestBuilder.comUnidade(unidadePadrao(empresaA, adminA,
                "UN")).nome("Arroz da A").codigosBarras("7891000315507").build());
        UUID unDaB = unidadePadrao(empresaB, adminB, "UN");

        ProdutoResponse daB = produtoService.cadastrarParaUsuario(adminB,
                ProdutoRequestBuilder.comUnidade(unDaB).nome("Arroz da B").codigosBarras("7891000315507").build());

        assertThat(daB.codigosBarras()).extracting(CodigoBarrasResponse::codigo).containsExactly("7891000315507");
        assertThatThrownBy(() -> produtoService.cadastrarParaUsuario(adminB,
                ProdutoRequestBuilder.comUnidade(unDaB).nome("Outro da B").codigosBarras("7891000315507").build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("O código de barras 7891000315507 já está cadastrado no produto \"Arroz da B\".");
    }

    /**
     * Lacuna do QA: na EDICAO (produto atual informado), adicionar o codigo de
     * outro produto da mesma empresa da 409 com o nome dele e o campo
     * {@code codigosBarras}, e a lista gravada do produto editado nao muda.
     */
    @Test
    void patchComCodigoDeOutroProdutoDaEmpresaLanca409ComNome() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Arroz da A").codigosBarras("7891000315507").build());
        ProdutoResponse feijao = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Feijão da A").codigosBarras("96385074").build());

        assertThatThrownBy(() -> produtoService.atualizarDadosBasicosParaUsuario(idUsuario, feijao.id(),
                ProdutoRequestBuilder.comUnidade(un).nome("Feijão da A").codigosBarras("96385074", "7891000315507")
                        .build()))
                .isInstanceOfSatisfying(ProdutoConflitoException.class,
                        conflito -> assertThat(conflito.campo()).contains("codigosBarras"))
                .hasMessage("O código de barras 7891000315507 já está cadastrado no produto \"Arroz da A\".");

        assertThat(codigosGravadosEmOrdem(feijao.id())).containsExactly("96385074");
    }

    @Test
    void excluirProdutoApagaCodigos() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        ProdutoResponse cadastrado = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Bala").codigosBarras("96385074", "BALA-01").build());
        Long idInterno = idInternoDoProduto(cadastrado.id());
        assertThat(codigosDoProduto(idInterno)).isEqualTo(2);

        produtoService.excluirParaUsuario(idUsuario, cadastrado.id());

        assertThat(codigosDoProduto(idInterno)).isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM produtos WHERE uuid = ?", Long.class,
                cadastrado.id())).isZero();
        assertThatThrownBy(() -> produtoService.buscarPorIdParaUsuario(idUsuario, cadastrado.id()))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
    }

    /** Fase B3: a embalagem e os codigos dela saem junto com o produto (cascade), sem erro de FK. */
    @Test
    void excluirProdutoComEmbalagemApagaAEmbalagemEOsCodigos() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        ProdutoResponse cadastrado = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Nexgard").codigosBarras("96385074").build());
        Long idInterno = idInternoDoProduto(cadastrado.id());
        Long caixa = inserirEmbalagem(empresa, idInterno, "CX");
        jdbcTemplate.update("""
                INSERT INTO produto_codigos_barras (empresa_id, produto_id, embalagem_id, codigo, formato, ordem)
                VALUES (?, ?, ?, '7891000315507', 'EAN13', 0)
                """, empresa.getId(), idInterno, caixa);

        produtoService.excluirParaUsuario(idUsuario, cadastrado.id());

        assertThat(codigosDoProduto(idInterno)).isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM produto_embalagens WHERE produto_id = ?",
                Long.class, idInterno)).isZero();
    }

    /** Fase B3 (spec 4): a unidade usada so numa embalagem conta 1 produto e nao pode ser excluida. */
    @Test
    void unidadeUsadaSoEmEmbalagemNaoPodeSerExcluida() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        ProdutoResponse cadastrado = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Sachê").build());
        inserirEmbalagem(empresa, idInternoDoProduto(cadastrado.id()), "CX");
        UUID cx = unidadePadrao(empresa, idUsuario, "CX");

        assertThat(unidadeService.listarParaUsuario(idUsuario, null).stream()
                .filter(unidade -> unidade.id().equals(cx))
                .findFirst().orElseThrow().emUso()).isEqualTo(1);
        assertThatThrownBy(() -> unidadeService.excluirParaUsuario(idUsuario, cx))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage("Esta unidade está em uso por 1 produto(s). Inative-a para que não apareça em novos "
                        + "cadastros.");
    }

    /** Embalagem c/ 12 da unidade padrao com a sigla, gravada direto no banco (a API vem na Task 3). */
    private Long inserirEmbalagem(Empresa empresa, Long produtoId, String sigla) {
        return jdbcTemplate.queryForObject("""
                INSERT INTO produto_embalagens (uuid, empresa_id, produto_id, unidade_id, quantidade, ordem)
                VALUES (?, ?, ?, (SELECT id FROM unidades_medida WHERE empresa_id = ? AND sigla = ?), 12, 0)
                RETURNING id
                """, Long.class, UUID.randomUUID(), empresa.getId(), produtoId, empresa.getId(), sigla);
    }

    @Test
    void excluirProdutoDeOutraEmpresaLanca404ENaoApaga() {
        Empresa empresaA = novaEmpresa();
        Long adminA = novoAdmin(empresaA);
        Empresa empresaB = novaEmpresa();
        Long adminB = novoAdmin(empresaB);
        ProdutoResponse daA = produtoService.cadastrarParaUsuario(adminA, ProdutoRequestBuilder
                .comUnidade(unidadePadrao(empresaA, adminA, "UN")).nome("Da A").codigosBarras("96385074").build());

        assertThatThrownBy(() -> produtoService.excluirParaUsuario(adminB, daA.id()))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
        assertThat(codigosDoProduto(idInternoDoProduto(daA.id()))).isEqualTo(1);
    }

    @Test
    void skuSugeridoComBancoReal() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("A").sku("P000030").build());
        produtoService.cadastrarParaUsuario(idUsuario, ProdutoRequestBuilder.comUnidade(un).nome("B").build());

        assertThat(produtoService.sugerirSkuParaUsuario(idUsuario)).isEqualTo("P000031");
    }

    // ---------- Fase C: promocao e atacado ----------

    /** Colunas da V8 gravadas e lidas pelo JPA; PATCH com promocao e atacado nulos limpa as cinco. */
    @Test
    void promocaoEAtacadoGravadosNoBancoEPatchNuloRemove() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        LocalDate inicio = LocalDate.of(2026, 11, 1);
        LocalDate fim = LocalDate.of(2026, 11, 15);
        ProdutoResponse cadastrado = produtoService.cadastrarParaUsuario(idUsuario, ProdutoRequestBuilder
                .comUnidade(un).nome("Ração").promocao("8.90", inicio, fim).atacado("8.50", "12").build());

        ProdutoResponse lido = produtoService.buscarPorIdParaUsuario(idUsuario, cadastrado.id());

        assertThat(lido.promocao().preco()).isEqualByComparingTo("8.90");
        assertThat(lido.promocao().inicio()).isEqualTo(inicio);
        assertThat(lido.promocao().fim()).isEqualTo(fim);
        assertThat(lido.atacado().preco()).isEqualByComparingTo("8.50");
        assertThat(lido.atacado().quantidadeMinima()).isEqualByComparingTo("12");

        ProdutoResponse semBlocos = produtoService.atualizarDadosBasicosParaUsuario(idUsuario, cadastrado.id(),
                ProdutoRequestBuilder.comUnidade(un).nome("Ração").build());

        assertThat(semBlocos.promocao()).isNull();
        assertThat(semBlocos.atacado()).isNull();
        assertThat(semBlocos.emPromocao()).isFalse();
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM produtos
                 WHERE id = ? AND preco_promocional IS NULL AND promocao_inicio IS NULL AND promocao_fim IS NULL
                   AND preco_atacado IS NULL AND quantidade_minima_atacado IS NULL
                """, Long.class, idInternoDoProduto(cadastrado.id()))).isEqualTo(1);
    }

    // ---------- Fase C: historico de precos ----------

    /** Produto com preco 10,00 e custo 7,00, editado depois no preco (11,50) e depois no custo (7,50). */
    private UUID produtoComTresAlteracoes(Long idUsuario, UUID un) {
        UUID produto = produtoService.cadastrarParaUsuario(idUsuario, ProdutoRequestBuilder.comUnidade(un)
                .nome("Arroz").precoVenda("10.00").custo("7.00").build()).id();
        produtoService.atualizarDadosBasicosParaUsuario(idUsuario, produto, ProdutoRequestBuilder.comUnidade(un)
                .nome("Arroz").precoVenda("11.50").custo("7.00").build());
        produtoService.atualizarDadosBasicosParaUsuario(idUsuario, produto, ProdutoRequestBuilder.comUnidade(un)
                .nome("Arroz").precoVenda("11.50").custo("7.50").build());
        return produto;
    }

    private static org.assertj.core.groups.Tuple linha(CampoHistoricoPreco campo, String anterior, String novo) {
        return org.assertj.core.groups.Tuple.tuple(campo, anterior == null ? null : new BigDecimal(anterior),
                new BigDecimal(novo));
    }

    /** Review Focus 5 + spec 4.6: cadastro e edicoes gravam so o que mudou, com o usuario, na ordem certa. */
    @Test
    void historicoGravadoNoBancoDoMaisRecenteParaOMaisAntigo() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        UUID produto = produtoComTresAlteracoes(idUsuario, un);
        // Mudar so nome, promocao e atacado nao gera linha.
        produtoService.atualizarDadosBasicosParaUsuario(idUsuario, produto, ProdutoRequestBuilder.comUnidade(un)
                .nome("Arroz 5kg").precoVenda("11.5").custo("7.5")
                .promocao("9.90", LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 15)).atacado("9.50", "12")
                .build());

        PaginaResponse<HistoricoPrecoResponse> pagina = produtoService.historicoDePrecosParaUsuario(idUsuario,
                produto, 0, 20);

        assertThat(pagina.totalItens()).isEqualTo(4);
        assertThat(pagina.itens())
                .extracting(HistoricoPrecoResponse::campo, HistoricoPrecoResponse::valorAnterior,
                        HistoricoPrecoResponse::valorNovo)
                .containsExactly(
                        linha(CampoHistoricoPreco.CUSTO, "7.00", "7.50"),
                        linha(CampoHistoricoPreco.PRECO_VENDA, "10.00", "11.50"),
                        linha(CampoHistoricoPreco.CUSTO, null, "7.00"),
                        linha(CampoHistoricoPreco.PRECO_VENDA, null, "10.00"));
        assertThat(pagina.itens()).allSatisfy(item -> {
            assertThat(item.usuarioNome()).isEqualTo("Admin");
            assertThat(item.alteradoEm()).isNotNull();
        });
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM produto_historico_precos WHERE produto_id = ? AND usuario_id = ?",
                Long.class, idInternoDoProduto(produto), idUsuario)).isEqualTo(4);
    }

    /**
     * A ordem segue {@code alterado_em} e o id so desempata: duas linhas
     * inseridas com a data invertida em relacao ao id saem pela data.
     */
    @Test
    void ordemPorAlteradoEmAntesDoId() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID produto = produtoService.cadastrarParaUsuario(idUsuario, ProdutoRequestBuilder
                .comUnidade(unidadePadrao(empresa, idUsuario, "UN")).nome("Arroz").precoVenda("10.00").build()).id();
        Long idInterno = idInternoDoProduto(produto);
        String inserir = """
                INSERT INTO produto_historico_precos
                       (empresa_id, produto_id, campo, valor_anterior, valor_novo, usuario_id, alterado_em, origem)
                VALUES (?, ?, 'CUSTO', NULL, ?, ?, ?, 'EDICAO')
                """;
        // Id menor com a data mais recente; id maior com a data mais antiga.
        jdbcTemplate.update(inserir, empresa.getId(), idInterno, new BigDecimal("5.00"), idUsuario,
                LocalDateTime.of(2020, 1, 2, 10, 0));
        jdbcTemplate.update(inserir, empresa.getId(), idInterno, new BigDecimal("6.00"), idUsuario,
                LocalDateTime.of(2020, 1, 1, 10, 0));

        PaginaResponse<HistoricoPrecoResponse> pagina = produtoService.historicoDePrecosParaUsuario(idUsuario,
                produto, 0, 20);

        assertThat(pagina.itens()).extracting(HistoricoPrecoResponse::valorNovo)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("10.00"), new BigDecimal("5.00"), new BigDecimal("6.00"));
    }

    @Test
    void historicoPaginado() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID produto = produtoComTresAlteracoes(idUsuario, unidadePadrao(empresa, idUsuario, "UN"));

        PaginaResponse<HistoricoPrecoResponse> segunda = produtoService.historicoDePrecosParaUsuario(idUsuario,
                produto, 1, 2);

        assertThat(segunda.pagina()).isEqualTo(1);
        assertThat(segunda.tamanho()).isEqualTo(2);
        assertThat(segunda.totalItens()).isEqualTo(4);
        assertThat(segunda.itens()).extracting(HistoricoPrecoResponse::valorNovo)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("7.00"), new BigDecimal("10.00"));
        assertThat(produtoService.historicoDePrecosParaUsuario(idUsuario, produto, 2, 2).itens()).isEmpty();
    }

    /**
     * O historico e gravado na MESMA transacao do produto: se a 2a linha
     * (CUSTO) falha, a 1a (PRECO_VENDA) e a propria alteracao do produto sao
     * desfeitas. A falha e simulada no spy do repositorio de historico.
     */
    @Test
    void falhaAoGravarOHistoricoDesfazAsLinhasEAAlteracaoDoProduto() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        UUID produto = produtoService.cadastrarParaUsuario(idUsuario, ProdutoRequestBuilder.comUnidade(un)
                .nome("Arroz").precoVenda("10.00").custo("7.00").build()).id();
        Long idInterno = idInternoDoProduto(produto);
        falharNoSegundoSaveDoHistorico();

        assertThatThrownBy(() -> produtoService.atualizarDadosBasicosParaUsuario(idUsuario, produto,
                ProdutoRequestBuilder.comUnidade(un).nome("Arroz 5kg").precoVenda("12.00").custo("8.00").build()))
                .isInstanceOf(IllegalStateException.class);

        verify(historicoPrecoRepository, times(2)).save(any(HistoricoPreco.class));
        assertThat(jdbcTemplate.queryForList(
                "SELECT campo FROM produto_historico_precos WHERE produto_id = ? ORDER BY id", String.class, idInterno))
                .as("so as linhas do cadastro").containsExactly("PRECO_VENDA", "CUSTO");
        assertThat(jdbcTemplate.queryForMap("SELECT nome, preco_venda, custo FROM produtos WHERE id = ?", idInterno))
                .containsEntry("nome", "Arroz")
                .containsEntry("preco_venda", new BigDecimal("10.00"))
                .containsEntry("custo", new BigDecimal("7.00"));
    }

    @Test
    void historicoDeProdutoDeOutraEmpresa_404() {
        Empresa empresaA = novaEmpresa();
        Long adminA = novoAdmin(empresaA);
        Long adminB = novoAdmin(novaEmpresa());
        UUID produtoDaA = produtoService.cadastrarParaUsuario(adminA,
                ProdutoRequestBuilder.comUnidade(unidadePadrao(empresaA, adminA, "UN")).nome("Da A").build()).id();

        assertThatThrownBy(() -> produtoService.historicoDePrecosParaUsuario(adminB, produtoDaA, 0, 20))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
    }

    @Test
    void excluirProdutoComHistoricoApagaAsLinhas() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID produto = produtoComTresAlteracoes(idUsuario, unidadePadrao(empresa, idUsuario, "UN"));
        Long idInterno = idInternoDoProduto(produto);

        produtoService.excluirParaUsuario(idUsuario, produto);

        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM produto_historico_precos WHERE produto_id = ?",
                Long.class, idInterno)).isZero();
    }

    /**
     * O 1o save do historico vai ao banco; o 2o lanca. O spy de um repositorio
     * Spring Data (proxy de interface) delega pela resposta padrao, entao o
     * "metodo real" e chamado por ela, e nao por {@code doCallRealMethod}. As
     * chamadas anteriores (do cadastro) sao descartadas da contagem.
     */
    private void falharNoSegundoSaveDoHistorico() {
        clearInvocations(historicoPrecoRepository);
        Answer<?> gravarDeVerdade = mockingDetails(historicoPrecoRepository).getMockCreationSettings()
                .getDefaultAnswer();
        AtomicInteger salvos = new AtomicInteger();
        doAnswer(invocacao -> {
            if (salvos.incrementAndGet() == 2) {
                throw new IllegalStateException("Falha simulada ao gravar o histórico.");
            }
            return gravarDeVerdade.answer(invocacao);
        }).when(historicoPrecoRepository).save(any(HistoricoPreco.class));
    }

    private UUID unidadePadrao(Empresa empresa, Long idUsuario, String sigla) {
        unidadeService.criarPadroes(empresa);
        return siglaParaUuid(unidadeService.listarParaUsuario(idUsuario, null), sigla);
    }

    /** Id interno da linha do codigo no produto (prova que a linha foi mantida, nao recriada). */
    private Long idDoCodigo(UUID produtoId, String codigo) {
        return jdbcTemplate.queryForObject("""
                SELECT c.id FROM produto_codigos_barras c
                  JOIN produtos p ON p.id = c.produto_id
                WHERE p.uuid = ? AND c.codigo = ?
                """, Long.class, produtoId, codigo);
    }

    /** Codigos gravados do produto, na ordem persistida. */
    private List<String> codigosGravadosEmOrdem(UUID produtoId) {
        return jdbcTemplate.queryForList("""
                SELECT c.codigo FROM produto_codigos_barras c
                  JOIN produtos p ON p.id = c.produto_id
                WHERE p.uuid = ?
                ORDER BY c.ordem
                """, String.class, produtoId);
    }

    private LocalDateTime atualizadoEmGravado(UUID produtoId) {
        return jdbcTemplate.queryForObject("SELECT atualizado_em FROM produtos WHERE uuid = ?", LocalDateTime.class,
                produtoId);
    }

    private Long idInternoDoProduto(UUID produtoId) {
        return jdbcTemplate.queryForObject("SELECT id FROM produtos WHERE uuid = ?", Long.class, produtoId);
    }

    /** Conta pela FK interna: continua valendo depois de o produto ser apagado. */
    private long codigosDoProduto(Long idInterno) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM produto_codigos_barras WHERE produto_id = ?",
                Long.class, idInterno);
    }

    // ---------- Fase B2: numero e codigo do produto ----------

    private static final int CADASTROS_SIMULTANEOS = 10;

    @Test
    void cadastroGeraNumeroSequencialEEdicaoNaoMuda() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");

        ProdutoResponse primeiro = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Arroz").build());
        ProdutoResponse segundo = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Feijão").build());
        ProdutoResponse editado = produtoService.atualizarDadosBasicosParaUsuario(idUsuario, segundo.id(),
                ProdutoRequestBuilder.comUnidade(un).nome("Feijão preto").build());

        assertThat(primeiro.numero()).isEqualTo(1L);
        assertThat(segundo.numero()).isEqualTo(2L);
        assertThat(editado.numero()).isEqualTo(2L);
        assertThat(numeroGravado(segundo.id())).isEqualTo(2L);
    }

    /** Review Focus 1: o SKU repetido falha e nao "queima" numero; o proximo cadastro e o 2. */
    @Test
    void cadastroRecusadoAntesDeReservarNaoConsomeNumero() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        produtoService.cadastrarParaUsuario(idUsuario, ProdutoRequestBuilder.comUnidade(un).sku("S-1").build());

        assertThatThrownBy(() -> produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).sku("S-1").build()))
                .isInstanceOf(ProdutoConflitoException.class);

        assertThat(produtoService.cadastrarParaUsuario(idUsuario, ProdutoRequestBuilder.comUnidade(un).build())
                .numero()).isEqualTo(2L);
    }

    /** Spec 2: o numero nunca e reaproveitado; excluir o ultimo deixa o numero vago. */
    @Test
    void numeroDeProdutoExcluidoNaoEReaproveitado() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        produtoService.cadastrarParaUsuario(idUsuario, ProdutoRequestBuilder.comUnidade(un).nome("Um").build());
        produtoService.cadastrarParaUsuario(idUsuario, ProdutoRequestBuilder.comUnidade(un).nome("Dois").build());
        ProdutoResponse terceiro = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Tres").build());
        assertThat(terceiro.numero()).isEqualTo(3L);

        produtoService.excluirParaUsuario(idUsuario, terceiro.id());

        assertThat(produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Quatro").build()).numero()).isEqualTo(4L);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT ultimo_numero FROM numeracoes WHERE empresa_id = ? AND tipo = 'PRODUTO'", Long.class,
                empresa.getId())).isEqualTo(4L);
    }

    /** Review Focus 1: cadastros simultaneos na mesma empresa recebem numeros distintos e consecutivos. */
    @Test
    void cadastrosSimultaneosRecebemNumerosDistintos() throws Exception {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        CyclicBarrier largada = new CyclicBarrier(CADASTROS_SIMULTANEOS);
        ExecutorService executor = Executors.newFixedThreadPool(CADASTROS_SIMULTANEOS);
        try {
            List<Future<Long>> cadastros = new ArrayList<>();
            for (int indice = 0; indice < CADASTROS_SIMULTANEOS; indice++) {
                String nome = "Produto simultaneo " + indice;
                cadastros.add(executor.submit(() -> {
                    largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
                    return produtoService.cadastrarParaUsuario(idUsuario,
                            ProdutoRequestBuilder.comUnidade(un).nome(nome).build()).numero();
                }));
            }
            List<Long> numeros = new ArrayList<>();
            for (Future<Long> cadastro : cadastros) {
                numeros.add(cadastro.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS));
            }

            assertThat(numeros).containsExactlyInAnyOrderElementsOf(
                    LongStream.rangeClosed(1, CADASTROS_SIMULTANEOS).boxed().toList());
        } finally {
            executor.shutdownNow();
        }
    }

    /** Review Focus 2: o codigo e um numero, entao 542 repetido conflita (o front envia "000542" como 542). */
    @Test
    void codigoRepetidoNaEmpresa_409ComNomeMasLivreEmOutraEmpresa() {
        Empresa empresaA = novaEmpresa();
        Long adminA = novoAdmin(empresaA);
        UUID unA = unidadePadrao(empresaA, adminA, "UN");
        Empresa empresaB = novaEmpresa();
        Long adminB = novoAdmin(empresaB);
        UUID unB = unidadePadrao(empresaB, adminB, "UN");
        produtoService.cadastrarParaUsuario(adminA,
                ProdutoRequestBuilder.comUnidade(unA).nome("Açúcar a granel").codigoDoProduto(542).build());

        assertThatThrownBy(() -> produtoService.cadastrarParaUsuario(adminA,
                ProdutoRequestBuilder.comUnidade(unA).nome("Feijão a granel").codigoDoProduto(542).build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Este código já está em uso no produto Açúcar a granel.");
        assertThat(produtoService.cadastrarParaUsuario(adminB,
                ProdutoRequestBuilder.comUnidade(unB).codigoDoProduto(542).build()).codigo()).isEqualTo(542);
    }

    /**
     * Corrida no codigo: a checagem "passa" (simulada pelo spy, como se o outro
     * cadastro ainda nao tivesse gravado) e o banco recusa por
     * {@code uq_produto_empresa_codigo}. A resposta e o 409 com o nome, lido
     * numa transacao nova, e o numero reservado volta (rollback).
     */
    @Test
    void codigoGravadoAoMesmoTempo_409ComNomeSemConsumirNumero() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID kg = unidadePadrao(empresa, idUsuario, "KG");
        produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(kg).nome("Açúcar a granel").codigoDoProduto(542).build());
        doReturn(Optional.empty()).when(produtoRepository).nomeDoProdutoComCodigo(empresa.getId(), 542, null);

        assertThatThrownBy(() -> produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(kg).nome("Feijão a granel").codigoDoProduto(542).build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Este código já está em uso no produto Açúcar a granel.")
                .extracting(erro -> ((ProdutoConflitoException) erro).campo()).isEqualTo(Optional.of("codigo"));

        assertThat(produtoService.cadastrarParaUsuario(idUsuario, ProdutoRequestBuilder.comUnidade(kg).build())
                .numero()).isEqualTo(2L);
    }

    /**
     * Corrida na EDICAO: a checagem do codigo "passa" (spy, como se o outro
     * produto ainda nao tivesse gravado) e o banco recusa no flush da edicao.
     * A resposta e o 409 com o nome do outro produto (a releitura ignora o
     * proprio produto) e a edicao e desfeita.
     */
    @Test
    void codigoGravadoAoMesmoTempoNaEdicao_409ComNomeECampo() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID kg = unidadePadrao(empresa, idUsuario, "KG");
        produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(kg).nome("Açúcar a granel").codigoDoProduto(542).build());
        ProdutoResponse feijao = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(kg).nome("Feijão a granel").build());
        Long idDoFeijao = idInternoDoProduto(feijao.id());
        doReturn(Optional.empty()).when(produtoRepository).nomeDoProdutoComCodigo(empresa.getId(), 542, idDoFeijao);

        assertThatThrownBy(() -> produtoService.atualizarDadosBasicosParaUsuario(idUsuario, feijao.id(),
                ProdutoRequestBuilder.comUnidade(kg).nome("Feijão a granel").codigoDoProduto(542).build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Este código já está em uso no produto Açúcar a granel.")
                .extracting(erro -> ((ProdutoConflitoException) erro).campo()).isEqualTo(Optional.of("codigo"));

        assertThat(jdbcTemplate.queryForObject("SELECT codigo FROM produtos WHERE uuid = ?", Integer.class,
                feijao.id())).isNull();
    }

    /** Review Focus 5: produto sem codigo (como os migrados) editado com codigo nulo e balanca false. */
    @Test
    void produtoAntigoSemCodigoEditadoESalvo() {
        Empresa empresa = novaEmpresa();
        Long idUsuario = novoAdmin(empresa);
        UUID un = unidadePadrao(empresa, idUsuario, "UN");
        ProdutoResponse antigo = produtoService.cadastrarParaUsuario(idUsuario,
                ProdutoRequestBuilder.comUnidade(un).nome("Arroz").build());

        ProdutoResponse editado = produtoService.atualizarDadosBasicosParaUsuario(idUsuario, antigo.id(),
                ProdutoRequestBuilder.comUnidade(un).nome("Arroz tipo 1").codigoDoProduto(null).vendidoBalanca(false)
                        .build());

        assertThat(editado.codigo()).isNull();
        assertThat(editado.vendidoBalanca()).isFalse();
        assertThat(editado.numero()).isEqualTo(antigo.numero());
    }

    private Long numeroGravado(UUID produtoId) {
        return jdbcTemplate.queryForObject("SELECT numero FROM produtos WHERE uuid = ?", Long.class, produtoId);
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
