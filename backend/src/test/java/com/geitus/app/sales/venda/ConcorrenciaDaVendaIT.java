package com.geitus.app.sales.venda;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.sales.CenarioDoPdv.EmpresaDoPdv;
import com.geitus.app.sales.CenarioDoPdv.NovoProduto;
import com.geitus.app.sales.ErroDaVenda;
import com.geitus.app.sales.IntegracaoDoPdv;
import com.geitus.app.sales.dto.ItemDoCarrinhoRequest;
import com.geitus.app.sales.dto.PagamentoRequest;
import com.geitus.app.sales.venda.dto.CancelamentoRequest;
import com.geitus.app.sales.venda.dto.FinalizarVendaRequest;

/**
 * Concorrencia do PDV (docs/modules/pdv.md, 3.6, 3.8 e 8; DT-032), com
 * pedidos simultaneos de verdade ({@link CyclicBarrier}) e varias rodadas:
 * <ul>
 *   <li>duas vendas do ultimo item com "Vender sem estoque" desligada: a trava
 *       dos produtos poe as duas em fila, uma grava e a outra recebe 409;</li>
 *   <li>duas finalizacoes com a mesma chave: uma venda so;</li>
 *   <li>uma venda e um cancelamento com os mesmos produtos em ordens
 *       diferentes: sessao primeiro, produtos em ordem de id, sem deadlock.</li>
 * </ul>
 */
class ConcorrenciaDaVendaIT extends IntegracaoDoPdv {

    private static final int RODADAS = 5;
    private static final long ESPERA_MAXIMA_SEGUNDOS = 30;
    private static final String CRIADA = "criada";
    private static final String REPETIDA = "repetida";

    @Autowired
    private VendasService vendasService;

    private ExecutorService executor;

    @BeforeEach
    void iniciarExecutor() {
        executor = Executors.newFixedThreadPool(2);
    }

    @AfterEach
    void pararExecutor() {
        executor.shutdownNow();
    }

    @Test
    void duasVendasDoUltimoItemComSemEstoqueDesligadoUmaRecebe409() throws Exception {
        for (int rodada = 1; rodada <= RODADAS; rodada++) {
            EmpresaDoPdv empresa = pdv.novaEmpresa();
            configurarPdv(empresa, false, "10");
            Long bruno = cenario.novoUsuario(empresa.caixa(), "Bruno Lima", "OPERADOR");
            abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
            abrirCaixa(bruno, cenario.novoPonto(empresa.caixa(), "Caixa 2"), "0.00");
            UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00").comEstoque("1")).id();
            CyclicBarrier largada = new CyclicBarrier(2);

            List<String> resultados = aoMesmoTempo(
                    finalizacao(largada, empresa.operadora(), pedido(racao, UUID.randomUUID())),
                    finalizacao(largada, bruno, pedido(racao, UUID.randomUUID())));

            assertThat(resultados).as("rodada %d", rodada)
                    .containsExactlyInAnyOrder(CRIADA, "Estoque insuficiente para Ração (saldo 0 UN).");
            assertThat(pdv.saldo(racao)).isEqualByComparingTo("0");
        }
    }

    @Test
    void duasFinalizacoesMesmaChaveUmaVenda() throws Exception {
        for (int rodada = 1; rodada <= RODADAS; rodada++) {
            EmpresaDoPdv empresa = pdv.novaEmpresa();
            abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
            UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00").comEstoque("5")).id();
            FinalizarVendaRequest mesmoPedido = pedido(racao, UUID.randomUUID());
            CyclicBarrier largada = new CyclicBarrier(2);

            List<String> resultados = aoMesmoTempo(
                    finalizacao(largada, empresa.operadora(), mesmoPedido),
                    finalizacao(largada, empresa.operadora(), mesmoPedido));

            assertThat(resultados).as("rodada %d", rodada).containsExactlyInAnyOrder(CRIADA, REPETIDA);
            assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM vendas WHERE empresa_id = ?", Long.class,
                    empresa.id())).isEqualTo(1);
            assertThat(pdv.saldo(racao)).isEqualByComparingTo("4");
        }
    }

    @Test
    void vendaECancelamentoSimultaneosSemDeadlock() throws Exception {
        for (int rodada = 1; rodada <= RODADAS; rodada++) {
            EmpresaDoPdv empresa = pdv.novaEmpresa();
            Long bruno = cenario.novoUsuario(empresa.caixa(), "Bruno Lima", "OPERADOR");
            abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
            abrirCaixa(bruno, cenario.novoPonto(empresa.caixa(), "Caixa 2"), "0.00");
            UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "5.00").comEstoque("10")).id();
            UUID feijao = pdv.produto(empresa, NovoProduto.de("Feijão", "UN", "8.00").comEstoque("10")).id();
            UUID vendaDoBruno = UUID.fromString(vender(bruno, item(arroz, "1") + "," + item(feijao, "1"),
                    pagamento("DINHEIRO", "13"), "13.00"));
            CyclicBarrier largada = new CyclicBarrier(2);

            List<String> resultados = aoMesmoTempo(
                    finalizacao(largada, empresa.operadora(), pedido(List.of(item(feijao), item(arroz)), "13.00",
                            UUID.randomUUID())),
                    () -> {
                        largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
                        vendasService.cancelarParaUsuario(empresa.admin(), vendaDoBruno,
                                new CancelamentoRequest("Erro"));
                        return "cancelada";
                    });

            assertThat(resultados).as("rodada %d", rodada).containsExactlyInAnyOrder(CRIADA, "cancelada");
            assertThat(pdv.saldo(arroz)).isEqualByComparingTo("9");
            assertThat(pdv.saldo(feijao)).isEqualByComparingTo("9");
        }
    }

    // ---------- Apoio ----------

    private Callable<String> finalizacao(CyclicBarrier largada, Long usuario, FinalizarVendaRequest pedido) {
        return () -> {
            largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
            try {
                return vendasService.finalizarParaUsuario(usuario, pedido).criada() ? CRIADA : REPETIDA;
            } catch (ErroDaVenda recusa) {
                return recusa.getMessage();
            }
        };
    }

    @SafeVarargs
    private List<String> aoMesmoTempo(Callable<String>... pedidos) throws Exception {
        List<Future<String>> futuros = new ArrayList<>();
        for (Callable<String> pedido : pedidos) {
            futuros.add(executor.submit(pedido));
        }
        List<String> resultados = new ArrayList<>();
        for (Future<String> futuro : futuros) {
            resultados.add(futuro.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS));
        }
        return resultados;
    }

    private static FinalizarVendaRequest pedido(UUID produto, UUID chave) {
        return pedido(List.of(item(produto)), "10.00", chave);
    }

    private static FinalizarVendaRequest pedido(List<ItemDoCarrinhoRequest> itens, String total, UUID chave) {
        return new FinalizarVendaRequest(itens, null, null,
                List.of(new PagamentoRequest(FormaDePagamento.DINHEIRO, new BigDecimal(total))), chave,
                new BigDecimal(total));
    }

    private static ItemDoCarrinhoRequest item(UUID produto) {
        return new ItemDoCarrinhoRequest(produto, null, BigDecimal.ONE, null, false, null, null);
    }
}
