package com.geitus.app.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.LongStream;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.ProdutoConflitoException;
import com.geitus.app.catalog.ProdutoNaoEncontradoException;
import com.geitus.app.catalog.ProdutoService;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.ResumoDeEstoque;
import com.geitus.app.catalog.SituacaoEstoque;
import com.geitus.app.catalog.UsoDoProdutoNoEstoque;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaRequest;
import com.geitus.app.inventory.dto.AjusteEstoqueRequest;

import jakarta.persistence.EntityManagerFactory;

/**
 * Integracao entre o catalogo e o estoque com o contexto Spring completo e um
 * PostgreSQL real (docs/modules/produtos-estoque.md, 4.1, 4.4, 4.7 e 4.8): o
 * estoque inicial no cadastro, a exclusao condicionada a movimentacao (com a
 * concorrencia entre exclusao e ajuste — Review Focus 2), a unidade de produto
 * movimentado, o controle desligado mantendo o saldo (Review Focus 4) e a
 * listagem carregando o estoque em lote.
 *
 * <p>Sem {@code @Transactional} na classe: cada chamada de service abre e
 * confirma a propria transacao. Requer Docker.
 */
@SpringBootTest
@Testcontainers
@Import(CenarioDeEstoque.class)
class EstoqueCatalogoIT {

    private static final int RODADAS_CONCORRENTES = 10;
    private static final long ESPERA_MAXIMA_SEGUNDOS = 30;
    private static final String MENSAGEM_EXCLUSAO_BLOQUEADA =
            "Este produto já teve movimentação de estoque e não pode ser excluído. Inative-o.";

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
    private EstoqueService estoqueService;

    @Autowired
    private UnidadeMedidaService unidadeService;

    @Autowired
    private CenarioDeEstoque cenario;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private UsoDoProdutoNoEstoque usoNoEstoque;

    /** Spy (chama o real por padrao) para simular falha ao gravar o movimento; resetado apos cada teste. */
    @MockitoSpyBean
    private MovimentoEstoqueRepository movimentoRepository;

    private ProdutoResponse cadastrarComEstoqueInicial(CenarioDeEstoque.EmpresaDeTeste empresa, String sigla,
            String nome, String estoqueInicial) {
        return produtoService.cadastrarParaUsuario(empresa.admin(),
                CenarioDeEstoque.produto(cenario.unidade(empresa, sigla), nome, true, estoqueInicial));
    }

    private static AjusteEstoqueRequest entrada(String quantidade) {
        return new AjusteEstoqueRequest(TipoMovimento.ENTRADA, new BigDecimal(quantidade), MotivoMovimento.COMPRA,
                null, UUID.randomUUID());
    }

    private long contarSaldos(Long idInterno) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM estoque_saldos WHERE produto_id = ?", Long.class,
                idInterno);
    }

    private long contarMovimentosPeloId(Long idInterno) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM movimentos_estoque WHERE produto_id = ?",
                Long.class, idInterno);
    }

    // ---------- Estoque inicial (spec 4.4) ----------

    @Test
    void cadastroComEstoqueInicialGravaAEntradaDoCadastro() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();

        ProdutoResponse cadastrado = cadastrarComEstoqueInicial(empresa, "KG", "Ração a granel", "12.5");

        assertThat(cadastrado.controlaEstoque()).isTrue();
        assertThat(cadastrado.estoqueAtual()).isEqualByComparingTo("12.5");
        assertThat(cadastrado.situacaoEstoque()).isEqualTo(SituacaoEstoque.NORMAL);
        assertThat(cadastrado.podeExcluir()).isTrue();
        assertThat(jdbcTemplate.queryForMap("""
                SELECT m.tipo, m.motivo, m.origem, m.quantidade, m.saldo_anterior, m.saldo_novo, m.usuario_id,
                       m.chave_idempotencia
                  FROM movimentos_estoque m JOIN produtos p ON p.id = m.produto_id
                 WHERE p.uuid = ?
                """, cadastrado.id()))
                .containsEntry("tipo", "ENTRADA")
                .containsEntry("motivo", "ESTOQUE_INICIAL")
                .containsEntry("origem", "CADASTRO")
                .containsEntry("quantidade", new BigDecimal("12.500"))
                .containsEntry("saldo_anterior", new BigDecimal("0.000"))
                .containsEntry("saldo_novo", new BigDecimal("12.500"))
                .containsEntry("usuario_id", empresa.admin())
                .containsEntry("chave_idempotencia", null);
        assertThat(produtoService.buscarPorIdParaUsuario(empresa.admin(), cadastrado.id()).estoqueAtual())
                .isEqualByComparingTo("12.5");
    }

    /** Se o movimento falha, o produto e a linha de saldo sao desfeitos junto (mesma transacao). */
    @Test
    void cadastroQueFalhaNaoGravaEstoqueInicial() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        doThrow(new IllegalStateException("Falha simulada ao gravar o movimento."))
                .when(movimentoRepository).save(any(MovimentoEstoque.class));

        assertThatThrownBy(() -> cadastrarComEstoqueInicial(empresa, "UN", "Arroz", "5"))
                .isInstanceOf(IllegalStateException.class);

        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM produtos WHERE empresa_id = ?", Long.class,
                empresa.empresa().getId())).isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM estoque_saldos WHERE empresa_id = ?",
                Long.class, empresa.empresa().getId())).isZero();
    }

    // ---------- Exclusao (spec 4.7) ----------

    @Test
    void excluirSemMovimentoApagaOProduto() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID produto = cenario.novoProduto(empresa, "UN", "Bala");

        produtoService.excluirParaUsuario(empresa.admin(), produto);

        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM produtos WHERE uuid = ?", Long.class, produto))
                .isZero();
    }

    @Test
    void excluirComSoEstoqueInicialApagaMovimentoESaldo() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse cadastrado = cadastrarComEstoqueInicial(empresa, "UN", "Cadastrado por engano", "5");
        Long idInterno = cenario.idInterno(cadastrado.id());

        produtoService.excluirParaUsuario(empresa.admin(), cadastrado.id());

        assertThat(contarMovimentosPeloId(idInterno)).isZero();
        assertThat(contarSaldos(idInterno)).isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM produtos WHERE id = ?", Long.class, idInterno))
                .isZero();
    }

    @Test
    void excluirComAjuste_409() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse cadastrado = cadastrarComEstoqueInicial(empresa, "UN", "Arroz", "5");
        estoqueService.ajustarParaUsuario(empresa.admin(), cadastrado.id(), entrada("1"));

        assertThat(produtoService.buscarPorIdParaUsuario(empresa.admin(), cadastrado.id()).podeExcluir()).isFalse();
        assertThatThrownBy(() -> produtoService.excluirParaUsuario(empresa.admin(), cadastrado.id()))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage(MENSAGEM_EXCLUSAO_BLOQUEADA);
        assertThat(cenario.contarMovimentos(cadastrado.id())).isEqualTo(2);
        assertThat(cenario.saldo(cadastrado.id())).isEqualByComparingTo("6");
    }

    /**
     * Review Focus 2: exclusao e ajuste do mesmo produto (so com o estoque
     * inicial) ao mesmo tempo. A trava do produto poe as duas em fila: ou a
     * exclusao conclui e o ajuste recebe 404, ou o ajuste conclui e a exclusao
     * recebe 409. Nunca outro erro, e o banco fica coerente com o desfecho.
     */
    @Test
    void exclusaoEAjusteConcorrentes_nuncaDao500() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            for (int rodada = 1; rodada <= RODADAS_CONCORRENTES; rodada++) {
                UUID produto = cadastrarComEstoqueInicial(empresa, "UN", "Disputado " + rodada, "5").id();
                Long idInterno = cenario.idInterno(produto);
                CyclicBarrier largada = new CyclicBarrier(2);

                Future<String> exclusao = executor.submit(aoMesmoTempo(largada, () -> {
                    produtoService.excluirParaUsuario(empresa.admin(), produto);
                    return "excluido";
                }));
                Future<String> ajuste = executor.submit(aoMesmoTempo(largada, () -> {
                    estoqueService.ajustarParaUsuario(empresa.admin(), produto, entrada("1"));
                    return "ajustado";
                }));

                List<String> desfechos = List.of(exclusao.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS),
                        ajuste.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS));
                assertThat(desfechos).as("rodada %d", rodada)
                        .isIn(List.of("excluido", "404"), List.of("409", "ajustado"));
                if (desfechos.get(0).equals("excluido")) {
                    assertThat(contarMovimentosPeloId(idInterno)).isZero();
                    assertThat(contarSaldos(idInterno)).isZero();
                } else {
                    assertThat(contarMovimentosPeloId(idInterno)).isEqualTo(2);
                }
            }
        } finally {
            executor.shutdownNow();
        }
    }

    /** Executa a acao depois da largada; 404 e 409 viram texto, qualquer outro erro sobe (falha o teste). */
    private static Callable<String> aoMesmoTempo(CyclicBarrier largada, Callable<String> acao) {
        return () -> {
            largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
            try {
                return acao.call();
            } catch (ProdutoNaoEncontradoException naoEncontrado) {
                return "404";
            } catch (ProdutoConflitoException conflito) {
                return "409";
            }
        };
    }

    // ---------- Unidade de produto movimentado (spec 4.8) ----------

    @Test
    void trocarUnidadeDeProdutoMovimentado_400() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse cadastrado = cadastrarComEstoqueInicial(empresa, "UN", "Arroz", "5");
        UUID semMovimento = cenario.novoProduto(empresa, "UN", "Feijão");
        UUID kg = cenario.unidade(empresa, "KG");

        assertThatThrownBy(() -> produtoService.atualizarDadosBasicosParaUsuario(empresa.admin(), cadastrado.id(),
                CenarioDeEstoque.produto(kg, "Arroz", true, null)))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Não é possível trocar a unidade de um produto com movimentação de estoque.");
        assertThat(produtoService.atualizarDadosBasicosParaUsuario(empresa.admin(), semMovimento,
                CenarioDeEstoque.produto(kg, "Feijão", true, null)).unidade().sigla()).isEqualTo("KG");
    }

    @Test
    void desligarFracionadaDeUnidadeUsadaPorProdutoMovimentado_400() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        cadastrarComEstoqueInicial(empresa, "KG", "Ração a granel", "2.5");
        UUID kg = cenario.unidade(empresa, "KG");
        UUID litro = cenario.unidade(empresa, "L");

        assertThatThrownBy(() -> unidadeService.atualizarParaUsuario(empresa.admin(), kg,
                new UnidadeMedidaRequest("KG", "Quilograma", false)))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Esta unidade é usada por produtos com movimentação de estoque.");
        assertThat(unidadeService.atualizarParaUsuario(empresa.admin(), litro,
                new UnidadeMedidaRequest("L", "Litro", false)).fracionada()).isFalse();
    }

    @Test
    void desligarFracionadaDeUnidadeUsadaPorProdutoSemMovimento_ok() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        cenario.novoProduto(empresa, "KG", "Ração a granel");
        UUID kg = cenario.unidade(empresa, "KG");

        assertThat(unidadeService.atualizarParaUsuario(empresa.admin(), kg,
                new UnidadeMedidaRequest("KG", "Quilograma", false)).fracionada()).isFalse();
    }

    /** Produto KG movimentado na empresa A nao bloqueia o KG da empresa B (DEC-016). */
    @Test
    void produtoMovimentadoDeOutraEmpresaNaoBloqueiaAUnidade() {
        CenarioDeEstoque.EmpresaDeTeste empresaA = cenario.novaEmpresa();
        CenarioDeEstoque.EmpresaDeTeste empresaB = cenario.novaEmpresa();
        cadastrarComEstoqueInicial(empresaA, "KG", "Ração da A", "2.5");
        cenario.novoProduto(empresaB, "KG", "Ração da B");

        assertThat(unidadeService.atualizarParaUsuario(empresaB.admin(), cenario.unidade(empresaB, "KG"),
                new UnidadeMedidaRequest("KG", "Quilograma", false)).fracionada()).isFalse();
        assertThatThrownBy(() -> unidadeService.atualizarParaUsuario(empresaA.admin(), cenario.unidade(empresaA, "KG"),
                new UnidadeMedidaRequest("KG", "Quilograma", false)))
                .isInstanceOf(RegraDeNegocioException.class);
    }

    // ---------- Controle desligado (Review Focus 4) ----------

    @Test
    void controleDesligadoMantemOSaldoEVoltaAoReligar() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID un = cenario.unidade(empresa, "UN");
        ProdutoResponse cadastrado = cadastrarComEstoqueInicial(empresa, "UN", "Arroz", "12");

        ProdutoResponse desligado = produtoService.atualizarDadosBasicosParaUsuario(empresa.admin(), cadastrado.id(),
                CenarioDeEstoque.produto(un, "Arroz", false, null));

        assertThat(desligado.controlaEstoque()).isFalse();
        assertThat(desligado.estoqueAtual()).isEqualByComparingTo("12");
        assertThat(desligado.situacaoEstoque()).isNull();
        assertThatThrownBy(() -> estoqueService.ajustarParaUsuario(empresa.admin(), cadastrado.id(), entrada("1")))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Este produto não controla estoque.");
        assertThat(estoqueService.movimentosParaUsuario(empresa.admin(), cadastrado.id(), 0, 20).totalItens())
                .isEqualTo(1);

        ProdutoResponse religado = produtoService.atualizarDadosBasicosParaUsuario(empresa.admin(), cadastrado.id(),
                CenarioDeEstoque.produto(un, "Arroz", true, null));

        assertThat(religado.estoqueAtual()).isEqualByComparingTo("12");
        assertThat(religado.situacaoEstoque()).isEqualTo(SituacaoEstoque.NORMAL);
    }

    // ---------- Listagem em lote ----------

    /**
     * O estoque da listagem vem em lote: o numero de comandos SQL nao cresce
     * com o numero de produtos (contado pelas estatisticas do Hibernate).
     */
    @Test
    void listagemCarregaEstoqueEmLote() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        tresProdutosComEstoquesDiferentes(empresa, "A");
        long comandosComTres = comandosAoListar(empresa, 3);

        tresProdutosComEstoquesDiferentes(empresa, "B");
        long comandosComSeis = comandosAoListar(empresa, 6);

        assertThat(comandosComSeis).isEqualTo(comandosComTres);
        List<ProdutoResponse> listados = produtoService.listarParaUsuario(empresa.admin(), null, null);
        assertThat(listados).extracting(ProdutoResponse::podeExcluir)
                .containsExactly(true, true, false, true, true, false);
        assertThat(listados).extracting(ProdutoResponse::estoqueAtual)
                .containsExactly(new BigDecimal("0.000"), new BigDecimal("2.000"), new BigDecimal("3.000"),
                        new BigDecimal("0.000"), new BigDecimal("2.000"), new BigDecimal("3.000"));
    }

    /** Sem movimento, so com o estoque inicial e com ajuste, nessa ordem alfabetica. */
    private void tresProdutosComEstoquesDiferentes(CenarioDeEstoque.EmpresaDeTeste empresa, String serie) {
        cenario.novoProduto(empresa, "UN", serie + "1 sem movimento");
        cadastrarComEstoqueInicial(empresa, "UN", serie + "2 so inicial", "2");
        UUID comAjuste = cadastrarComEstoqueInicial(empresa, "UN", serie + "3 com ajuste", "2").id();
        estoqueService.ajustarParaUsuario(empresa.admin(), comAjuste, entrada("1"));
    }

    /**
     * O resumo nao depende do numero de ids (sem {@code IN} com um parametro
     * por id): mais ids que o limite de parametros do PostgreSQL (32767) passam.
     */
    @Test
    void resumosAceitaMaisIdsQueOLimiteDeParametros() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse cadastrado = cadastrarComEstoqueInicial(empresa, "UN", "Arroz", "4");
        Long idInterno = cenario.idInterno(cadastrado.id());
        List<Long> ids = new ArrayList<>(LongStream.rangeClosed(1, 40_000).boxed().toList());
        ids.add(idInterno);

        Map<Long, ResumoDeEstoque> resumos = usoNoEstoque.resumos(empresa.empresa().getId(), ids);

        assertThat(resumos.get(idInterno)).isEqualTo(new ResumoDeEstoque(new BigDecimal("4.000"), 1, 0));
    }

    @Test
    void produtoSemLinhaDeSaldoTemSaldoZeroComTresCasas() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID produto = cenario.novoProduto(empresa, "UN", "Sem estoque");

        assertThat(produtoService.buscarPorIdParaUsuario(empresa.admin(), produto).estoqueAtual())
                .isEqualTo(new BigDecimal("0.000"));
    }

    private long comandosAoListar(CenarioDeEstoque.EmpresaDeTeste empresa, int esperados) {
        Statistics estatisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        estatisticas.clear();
        assertThat(produtoService.listarParaUsuario(empresa.admin(), null, null)).hasSize(esperados);
        return estatisticas.getPrepareStatementCount();
    }
}
