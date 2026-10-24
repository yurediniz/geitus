package com.geitus.app.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.CatalogoNaoEncontradoException;
import com.geitus.app.catalog.ProdutoConflitoException;
import com.geitus.app.catalog.ProdutoNaoEncontradoException;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.inventory.EstoqueService.ResultadoAjuste;
import com.geitus.app.inventory.dto.AjusteEstoqueRequest;
import com.geitus.app.inventory.dto.MovimentoEstoqueResponse;

/**
 * Integracao do servico de estoque com o contexto Spring completo e um
 * PostgreSQL real (Testcontainers, Flyway com as migrations de producao).
 *
 * <p>Cobre o que os testes com mock nao alcancam: o {@code INSERT ... ON
 * CONFLICT DO NOTHING} seguido de {@code FOR UPDATE} no primeiro movimento
 * concorrente (Review Focus 1), a idempotencia pela chave com dois pedidos
 * simultaneos (Review Focus 3), a consulta paginada com o nome do usuario e o
 * isolamento por empresa (DEC-016).
 *
 * <p>Sem {@code @Transactional} na classe: cada chamada de service abre e
 * confirma a propria transacao, como em producao. Cada teste usa empresa nova.
 * Requer Docker.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@Import(CenarioDeEstoque.class)
class EstoqueServiceIT {

    /** Rodadas do teste concorrente: sem a trava, ao menos uma costuma quebrar a cadeia. */
    private static final int RODADAS_CONCORRENTES = 10;
    private static final long ESPERA_MAXIMA_SEGUNDOS = 30;

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
    private EstoqueService estoqueService;

    @Autowired
    private CenarioDeEstoque cenario;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private MockMvc mockMvc;

    private static AjusteEstoqueRequest entrada(String quantidade) {
        return entrada(quantidade, UUID.randomUUID());
    }

    private static AjusteEstoqueRequest entrada(String quantidade, UUID chave) {
        return new AjusteEstoqueRequest(TipoMovimento.ENTRADA, new BigDecimal(quantidade), MotivoMovimento.COMPRA,
                null, chave, null);
    }

    // ---------- Concorrencia (Review Focus 1) ----------

    /**
     * Dois primeiros movimentos do produto ao mesmo tempo, sem linha de saldo:
     * nenhum erro, saldo final = soma e a cadeia fechada (o saldo anterior de um
     * e o saldo novo do outro). A trava do produto ja poe os dois pedidos em
     * fila; o {@code INSERT ... ON CONFLICT DO NOTHING} seguido de
     * {@code FOR UPDATE} no saldo e a segunda defesa, para caminhos que nao
     * travem o produto. Repetido em varias rodadas, cada uma com um produto
     * novo, para dar chance real a corrida.
     */
    @Test
    void ajustesConcorrentesMantemACadeia() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            for (int rodada = 1; rodada <= RODADAS_CONCORRENTES; rodada++) {
                UUID produto = cenario.novoProduto(empresa, "UN", "Arroz " + rodada);
                CyclicBarrier largada = new CyclicBarrier(2);

                Future<ResultadoAjuste> cinco = executor.submit(ajustarAoMesmoTempo(largada, empresa.admin(),
                        produto, entrada("5")));
                Future<ResultadoAjuste> tres = executor.submit(ajustarAoMesmoTempo(largada, empresa.admin(),
                        produto, entrada("3")));
                MovimentoEstoqueResponse primeiro = cinco.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS).movimento();
                MovimentoEstoqueResponse segundo = tres.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS).movimento();

                assertThat(cenario.saldo(produto)).as("rodada %d: saldo final", rodada).isEqualByComparingTo("8");
                assertThat(List.of(primeiro.saldoAnterior(), segundo.saldoAnterior()))
                        .as("rodada %d: um dos dois parte do zero", rodada)
                        .anySatisfy(anterior -> assertThat(anterior).isEqualByComparingTo("0"));
                boolean primeiroAntes = primeiro.saldoAnterior().signum() == 0;
                MovimentoEstoqueResponse antes = primeiroAntes ? primeiro : segundo;
                MovimentoEstoqueResponse depois = primeiroAntes ? segundo : primeiro;
                assertThat(depois.saldoAnterior()).as("rodada %d: cadeia", rodada)
                        .isEqualByComparingTo(antes.saldoNovo());
                assertThat(cenario.contarMovimentos(produto)).isEqualTo(2);
            }
        } finally {
            executor.shutdownNow();
        }
    }

    private Callable<ResultadoAjuste> ajustarAoMesmoTempo(CyclicBarrier largada, Long idUsuario, UUID produto,
            AjusteEstoqueRequest request) {
        return () -> {
            largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
            return estoqueService.ajustarParaUsuario(idUsuario, produto, request);
        };
    }

    /**
     * Saldo 5 e duas saidas de 3 ao mesmo tempo: uma grava e a outra recebe 400
     * com o saldo que sobrou. Nunca negativo, nunca 500.
     */
    @Test
    void saidasConcorrentesNuncaNegativam() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            for (int rodada = 1; rodada <= RODADAS_CONCORRENTES; rodada++) {
                UUID produto = cenario.novoProduto(empresa, "UN", "Sabão " + rodada);
                estoqueService.ajustarParaUsuario(empresa.admin(), produto, entrada("5"));
                CyclicBarrier largada = new CyclicBarrier(2);

                Future<String> uma = executor.submit(saidaAoMesmoTempo(largada, empresa.admin(), produto));
                Future<String> outra = executor.submit(saidaAoMesmoTempo(largada, empresa.admin(), produto));

                assertThat(List.of(uma.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS),
                        outra.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS)))
                        .as("rodada %d", rodada)
                        .containsExactlyInAnyOrder("criado", "Saldo insuficiente: há 2 UN.");
                assertThat(cenario.saldo(produto)).isEqualByComparingTo("2");
                assertThat(cenario.contarMovimentos(produto)).isEqualTo(2);
            }
        } finally {
            executor.shutdownNow();
        }
    }

    /** Saida de 3; {@code "criado"} ou a mensagem do 400. Qualquer outro erro sobe e falha o teste. */
    private Callable<String> saidaAoMesmoTempo(CyclicBarrier largada, Long idUsuario, UUID produto) {
        return () -> {
            largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
            try {
                estoqueService.ajustarParaUsuario(idUsuario, produto, new AjusteEstoqueRequest(TipoMovimento.SAIDA,
                        new BigDecimal("3"), MotivoMovimento.PERDA_AVARIA, null, UUID.randomUUID(),
                        null));
                return "criado";
            } catch (RegraDeNegocioException regra) {
                return regra.getMessage();
            }
        };
    }

    // ---------- Idempotencia (Review Focus 3) ----------

    @Test
    void chaveRepetidaDepoisDoPrimeiroPedidoDevolveOMesmoMovimento() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID produto = cenario.novoProduto(empresa, "UN", "Arroz");
        UUID chave = UUID.randomUUID();

        ResultadoAjuste primeiro = estoqueService.ajustarParaUsuario(empresa.admin(), produto, entrada("4", chave));
        ResultadoAjuste repetido = estoqueService.ajustarParaUsuario(empresa.admin(), produto, entrada("4", chave));

        assertThat(primeiro.criado()).isTrue();
        assertThat(repetido.criado()).isFalse();
        assertThat(repetido.movimento()).isEqualTo(primeiro.movimento());
        assertThat(cenario.contarMovimentos(produto)).isEqualTo(1);
        assertThat(cenario.saldo(produto)).isEqualByComparingTo("4");
    }

    @Test
    void chaveConcorrenteGravaUmSo() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            for (int rodada = 1; rodada <= RODADAS_CONCORRENTES; rodada++) {
                UUID produto = cenario.novoProduto(empresa, "UN", "Feijão " + rodada);
                UUID chave = UUID.randomUUID();
                CyclicBarrier largada = new CyclicBarrier(2);

                Future<ResultadoAjuste> um = executor.submit(ajustarAoMesmoTempo(largada, empresa.admin(), produto,
                        entrada("2", chave)));
                Future<ResultadoAjuste> outro = executor.submit(ajustarAoMesmoTempo(largada, empresa.admin(),
                        produto, entrada("2", chave)));

                List<Boolean> criados = List.of(um.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS).criado(),
                        outro.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS).criado());
                assertThat(criados).as("rodada %d", rodada).containsExactlyInAnyOrder(true, false);
                assertThat(cenario.contarMovimentos(produto)).isEqualTo(1);
                assertThat(cenario.saldo(produto)).isEqualByComparingTo("2");
            }
        } finally {
            executor.shutdownNow();
        }
    }

    /**
     * A mesma chave em dois produtos ao mesmo tempo (as travas de produto sao
     * diferentes, entao a corrida chega a {@code uq_movimento_estoque_chave}):
     * um grava e o outro recebe 409, nunca 500.
     */
    @Test
    void chaveConcorrenteEmProdutosDiferentesDa409NoSegundo() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            for (int rodada = 1; rodada <= RODADAS_CONCORRENTES; rodada++) {
                UUID arroz = cenario.novoProduto(empresa, "UN", "Arroz " + rodada);
                UUID feijao = cenario.novoProduto(empresa, "UN", "Feijão " + rodada);
                UUID chave = UUID.randomUUID();
                CyclicBarrier largada = new CyclicBarrier(2);

                Future<String> noArroz = executor.submit(desfecho(largada, empresa.admin(), arroz, chave));
                Future<String> noFeijao = executor.submit(desfecho(largada, empresa.admin(), feijao, chave));

                String desfechoNoArroz = noArroz.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
                String desfechoNoFeijao = noFeijao.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
                assertThat(List.of(desfechoNoArroz, desfechoNoFeijao))
                        .as("rodada %d", rodada).containsExactlyInAnyOrder("criado", "409");
                UUID perdedor = desfechoNoArroz.equals("409") ? arroz : feijao;
                UUID vencedor = perdedor.equals(arroz) ? feijao : arroz;
                assertThat(cenario.contarMovimentos(perdedor)).isZero();
                assertThat(cenario.saldo(perdedor)).as("rodada %d: saldo do perdedor", rodada)
                        .isEqualByComparingTo("0");
                assertThat(cenario.contarMovimentos(vencedor)).isEqualTo(1);
                assertThat(cenario.saldo(vencedor)).isEqualByComparingTo("1");
            }
        } finally {
            executor.shutdownNow();
        }
    }

    private Callable<String> desfecho(CyclicBarrier largada, Long idUsuario, UUID produto, UUID chave) {
        return () -> {
            largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
            try {
                return estoqueService.ajustarParaUsuario(idUsuario, produto, entrada("1", chave)).criado()
                        ? "criado" : "repetido";
            } catch (ProdutoConflitoException conflito) {
                return "409";
            }
        };
    }

    // ---------- Consulta ----------

    @Test
    void movimentosOrdenadosEPaginados() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID produto = cenario.novoProduto(empresa, "KG", "Ração a granel");
        estoqueService.ajustarParaUsuario(empresa.admin(), produto, entrada("10"));
        estoqueService.ajustarParaUsuario(empresa.admin(), produto, new AjusteEstoqueRequest(TipoMovimento.SAIDA,
                new BigDecimal("2.5"), MotivoMovimento.PERDA_AVARIA, "Saco rasgado", UUID.randomUUID(),
                null));
        estoqueService.ajustarParaUsuario(empresa.admin(), produto, new AjusteEstoqueRequest(TipoMovimento.AJUSTE,
                new BigDecimal("7"), MotivoMovimento.CONTAGEM, null, UUID.randomUUID(), null));

        PaginaResponse<MovimentoEstoqueResponse> primeira = estoqueService.movimentosParaUsuario(empresa.admin(),
                produto, 0, 2);
        PaginaResponse<MovimentoEstoqueResponse> segunda = estoqueService.movimentosParaUsuario(empresa.admin(),
                produto, 1, 2);

        assertThat(primeira.totalItens()).isEqualTo(3);
        assertThat(primeira.itens()).extracting(MovimentoEstoqueResponse::tipo)
                .containsExactly(TipoMovimento.AJUSTE, TipoMovimento.SAIDA);
        assertThat(primeira.itens().get(0).quantidade()).isEqualByComparingTo("-0.5");
        assertThat(primeira.itens().get(1).observacao()).isEqualTo("Saco rasgado");
        assertThat(segunda.itens()).extracting(MovimentoEstoqueResponse::tipo).containsExactly(TipoMovimento.ENTRADA);
        assertThat(primeira.itens()).allSatisfy(item -> {
            assertThat(item.usuarioNome()).isEqualTo("Admin");
            assertThat(item.id()).isNotNull();
            assertThat(item.criadoEm()).isNotNull();
        });
        assertThat(cenario.saldo(produto)).isEqualByComparingTo("7");
    }

    /** A ordem segue {@code criado_em} e o id so desempata. */
    @Test
    void ordemPorCriadoEmAntesDoId() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        UUID produto = cenario.novoProduto(empresa, "UN", "Arroz");
        estoqueService.ajustarParaUsuario(empresa.admin(), produto, entrada("1"));
        estoqueService.ajustarParaUsuario(empresa.admin(), produto, entrada("2"));
        jdbcTemplate.update("UPDATE movimentos_estoque SET criado_em = ? WHERE quantidade = 2 AND produto_id = "
                + "(SELECT id FROM produtos WHERE uuid = ?)", LocalDateTime.of(2020, 1, 1, 10, 0), produto);

        List<BigDecimal> quantidades = new ArrayList<>();
        estoqueService.movimentosParaUsuario(empresa.admin(), produto, 0, 20).itens()
                .forEach(item -> quantidades.add(item.quantidade()));

        assertThat(quantidades).usingElementComparator(BigDecimal::compareTo)
                .containsExactly(BigDecimal.ONE, new BigDecimal("2"));
    }

    @Test
    void produtoDeOutraEmpresa_404() {
        CenarioDeEstoque.EmpresaDeTeste empresaA = cenario.novaEmpresa();
        CenarioDeEstoque.EmpresaDeTeste empresaB = cenario.novaEmpresa();
        UUID produtoDaA = cenario.novoProduto(empresaA, "UN", "Da A");

        assertThatThrownBy(() -> estoqueService.ajustarParaUsuario(empresaB.admin(), produtoDaA, entrada("1")))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
        assertThatThrownBy(() -> estoqueService.movimentosParaUsuario(empresaB.admin(), produtoDaA, 0, 20))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
        assertThat(cenario.contarMovimentos(produtoDaA)).isZero();
    }

    /** A mesma chave em outra empresa e outro pedido: nao conflita nem devolve o movimento da outra. */
    @Test
    void chaveDeOutraEmpresaNaoInterfere() {
        CenarioDeEstoque.EmpresaDeTeste empresaA = cenario.novaEmpresa();
        CenarioDeEstoque.EmpresaDeTeste empresaB = cenario.novaEmpresa();
        UUID produtoDaA = cenario.novoProduto(empresaA, "UN", "Da A");
        UUID produtoDaB = cenario.novoProduto(empresaB, "UN", "Da B");
        UUID chave = UUID.randomUUID();

        estoqueService.ajustarParaUsuario(empresaA.admin(), produtoDaA, entrada("1", chave));
        ResultadoAjuste daB = estoqueService.ajustarParaUsuario(empresaB.admin(), produtoDaB, entrada("1", chave));

        assertThat(daB.criado()).isTrue();
        assertThat(cenario.contarMovimentos(produtoDaB)).isEqualTo(1);
    }

    // ---------- Em embalagens (Fase B3, docs/modules/produtos-embalagens.md, 6) ----------

    private static AjusteEstoqueRequest emCaixas(TipoMovimento tipo, String caixas, MotivoMovimento motivo,
            UUID embalagemId, UUID chave) {
        return new AjusteEstoqueRequest(tipo, new BigDecimal(caixas), motivo, null, chave, embalagemId);
    }

    private static UUID caixa(ProdutoResponse produto) {
        return produto.embalagens().get(0).id();
    }

    @Test
    void entradaDeDuasCaixasGravaTrintaESeisComORetrato() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse sache = cenario.novoProdutoComCaixa(empresa, "Sachê", "18");
        estoqueService.ajustarParaUsuario(empresa.admin(), sache.id(), entrada("10"));

        MovimentoEstoqueResponse movimento = estoqueService.ajustarParaUsuario(empresa.admin(), sache.id(),
                emCaixas(TipoMovimento.ENTRADA, "2", MotivoMovimento.COMPRA, caixa(sache), UUID.randomUUID()))
                .movimento();

        assertThat(movimento.quantidade()).isEqualByComparingTo("36");
        assertThat(movimento.saldoAnterior()).isEqualByComparingTo("10");
        assertThat(movimento.saldoNovo()).isEqualByComparingTo("46");
        assertThat(movimento.embalagem().rotulo()).isEqualTo("CX c/ 18 UN");
        assertThat(movimento.embalagem().quantidadePorEmbalagem()).isEqualByComparingTo("18");
        assertThat(movimento.embalagem().quantidadeDeEmbalagens()).isEqualTo(2);
        assertThat(cenario.saldo(sache.id())).isEqualByComparingTo("46");

        List<MovimentoEstoqueResponse> historico = estoqueService.movimentosParaUsuario(empresa.admin(), sache.id(),
                0, 20).itens();
        assertThat(historico.get(0).embalagem().rotulo()).isEqualTo("CX c/ 18 UN");
        assertThat(historico.get(0).embalagem().quantidadeDeEmbalagens()).isEqualTo(2);
        assertThat(historico.get(1).embalagem()).isNull();
    }

    @Test
    void saidaEmCaixasRespeitaOSaldoEmUnidades() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse sache = cenario.novoProdutoComCaixa(empresa, "Sachê", "18");
        estoqueService.ajustarParaUsuario(empresa.admin(), sache.id(), entrada("46"));

        assertThatThrownBy(() -> estoqueService.ajustarParaUsuario(empresa.admin(), sache.id(),
                emCaixas(TipoMovimento.SAIDA, "3", MotivoMovimento.PERDA_AVARIA, caixa(sache), UUID.randomUUID())))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Saldo insuficiente: há 46 UN.");

        estoqueService.ajustarParaUsuario(empresa.admin(), sache.id(), entrada("8"));
        MovimentoEstoqueResponse saida = estoqueService.ajustarParaUsuario(empresa.admin(), sache.id(),
                emCaixas(TipoMovimento.SAIDA, "3", MotivoMovimento.PERDA_AVARIA, caixa(sache), UUID.randomUUID()))
                .movimento();
        assertThat(saida.quantidade()).isEqualByComparingTo("-54");
        assertThat(cenario.saldo(sache.id())).isEqualByComparingTo("0");
    }

    @Test
    void embalagemDeOutroProduto404EFracaoDeCaixa400() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse sache = cenario.novoProdutoComCaixa(empresa, "Sachê", "18");
        ProdutoResponse racao = cenario.novoProdutoComCaixa(empresa, "Ração", "6");

        assertThatThrownBy(() -> estoqueService.ajustarParaUsuario(empresa.admin(), racao.id(),
                emCaixas(TipoMovimento.ENTRADA, "2", MotivoMovimento.COMPRA, caixa(sache), UUID.randomUUID())))
                .isInstanceOf(CatalogoNaoEncontradoException.class)
                .hasMessage("Embalagem não encontrada.");
        assertThatThrownBy(() -> estoqueService.ajustarParaUsuario(empresa.admin(), sache.id(),
                emCaixas(TipoMovimento.ENTRADA, "1.5", MotivoMovimento.COMPRA, caixa(sache), UUID.randomUUID())))
                .isInstanceOfSatisfying(RegraDeNegocioException.class,
                        erro -> assertThat(erro.campo()).contains("quantidade"))
                .hasMessage("Informe um número inteiro de embalagens.");
        assertThat(cenario.contarMovimentos(sache.id())).isZero();
        assertThat(cenario.contarMovimentos(racao.id())).isZero();
    }

    /** Review Focus 5: a chave repetida devolve o movimento gravado mesmo depois de a embalagem sair. */
    @Test
    void chaveRepetidaDepoisDeRemoverAEmbalagemDevolveOMovimentoOriginal() {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse sache = cenario.novoProdutoComCaixa(empresa, "Sachê", "18");
        UUID chave = UUID.randomUUID();
        AjusteEstoqueRequest duasCaixas = emCaixas(TipoMovimento.ENTRADA, "2", MotivoMovimento.COMPRA, caixa(sache),
                chave);
        ResultadoAjuste primeiro = estoqueService.ajustarParaUsuario(empresa.admin(), sache.id(), duasCaixas);
        cenario.removerEmbalagens(empresa, sache.id(), "Sachê");

        ResultadoAjuste repetido = estoqueService.ajustarParaUsuario(empresa.admin(), sache.id(), duasCaixas);

        assertThat(repetido.criado()).isFalse();
        assertThat(repetido.movimento()).isEqualTo(primeiro.movimento());
        assertThat(cenario.contarMovimentos(sache.id())).isEqualTo(1);
        assertThatThrownBy(() -> estoqueService.ajustarParaUsuario(empresa.admin(), sache.id(),
                emCaixas(TipoMovimento.ENTRADA, "2", MotivoMovimento.COMPRA, caixa(sache), UUID.randomUUID())))
                .isInstanceOf(CatalogoNaoEncontradoException.class);
    }

    @Test
    void movimentosPelaApiTrazemORetratoDaEmbalagem() throws Exception {
        CenarioDeEstoque.EmpresaDeTeste empresa = cenario.novaEmpresa();
        ProdutoResponse sache = cenario.novoProdutoComCaixa(empresa, "Sachê", "18");
        estoqueService.ajustarParaUsuario(empresa.admin(), sache.id(),
                emCaixas(TipoMovimento.ENTRADA, "2", MotivoMovimento.COMPRA, caixa(sache), UUID.randomUUID()));

        mockMvc.perform(get("/api/produtos/" + sache.id() + "/estoque/movimentos")
                        .header("Authorization", cenario.token(empresa.admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens[0].quantidade").value(36.0))
                .andExpect(jsonPath("$.itens[0].embalagem.rotulo").value("CX c/ 18 UN"))
                .andExpect(jsonPath("$.itens[0].embalagem.quantidadePorEmbalagem").value(18.0))
                .andExpect(jsonPath("$.itens[0].embalagem.quantidadeDeEmbalagens").value(2));
    }

    // ---------- Documentacao da API (Task 4) ----------

    /** O OpenAPI gerado traz os endpoints de estoque, os codigos de resposta e os campos novos do produto. */
    @Test
    void openApiDocumentaOsEndpointsDeEstoque() throws Exception {
        String ajustes = "$.paths['/api/produtos/{id}/estoque/ajustes'].post";
        String movimentos = "$.paths['/api/produtos/{id}/estoque/movimentos'].get";
        ResultActions documento = mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath(ajustes + ".summary").exists())
                .andExpect(jsonPath(ajustes + ".responses['201'].content").exists())
                .andExpect(jsonPath(movimentos + ".summary").exists())
                .andExpect(jsonPath("$.components.schemas.AjusteEstoqueRequest.properties.chave").exists())
                .andExpect(jsonPath("$.components.schemas.AjusteEstoqueRequest.properties.embalagemId").exists())
                .andExpect(jsonPath("$.components.schemas.MovimentoEstoqueResponse.properties.embalagem").exists())
                .andExpect(jsonPath("$.components.schemas.ProdutoRequest.properties.embalagens").exists())
                .andExpect(jsonPath("$.components.schemas.ProdutoResponse.properties.embalagens").exists())
                .andExpect(jsonPath("$.components.schemas.MovimentoEstoqueResponse.properties.usuarioNome").exists())
                .andExpect(jsonPath("$.components.schemas.ProdutoRequest.properties.estoqueInicial").exists())
                .andExpect(jsonPath("$.components.schemas.ProdutoResponse.properties.situacaoEstoque").exists());
        for (String codigo : List.of("200", "201", "400", "401", "403", "404", "409")) {
            documento.andExpect(jsonPath(ajustes + ".responses['" + codigo + "']").exists());
        }
        for (String codigo : List.of("200", "400", "401", "404")) {
            documento.andExpect(jsonPath(movimentos + ".responses['" + codigo + "']").exists());
        }
    }
}
