package com.geitus.app.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.geitus.app.inventory.EstoqueDaVenda.BaixaDeItem;
import com.geitus.app.sales.CenarioDoPdv.EmpresaDoPdv;
import com.geitus.app.sales.CenarioDoPdv.NovoProduto;
import com.geitus.app.sales.IntegracaoDoPdv;

/**
 * Estoque por venda (docs/modules/pdv.md, 3.6, 3.8 e 4.5; DT-032): baixa com
 * saldo negativo permitido so pela venda, estorno no cancelamento, produto sem
 * controle sem movimento e a trava dos produtos em ordem de id. As vendas e os
 * itens sao gravados por JDBC (a FK do movimento exige o item); o
 * {@link EstoqueDaVenda} e chamado direto, numa transacao do teste.
 */
class EstoqueDaVendaIT extends IntegracaoDoPdv {

    private static final int RODADAS_CONCORRENTES = 5;
    private static final long ESPERA_MAXIMA_SEGUNDOS = 30;

    @Autowired
    private EstoqueDaVenda estoqueDaVenda;

    @Autowired
    private PlatformTransactionManager gerenciadorDeTransacoes;

    private EmpresaDoPdv empresa;
    private UUID sessao;

    @BeforeEach
    void abrirCaixa() throws Exception {
        empresa = pdv.novaEmpresa();
        sessao = abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
    }

    @Test
    void baixaDeixaSaldoNegativo() {
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "5.00").comEstoque("2")).id();
        long item = itemVendido(arroz, "3");

        baixar(new BaixaDeItem(pdv.idDoProduto(arroz), item, new BigDecimal("3.000")));

        assertThat(pdv.saldo(arroz)).isEqualByComparingTo("-1");
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM movimentos_estoque WHERE item_venda_id = ? AND tipo = 'SAIDA' AND motivo = 'VENDA'
                   AND origem = 'VENDA' AND quantidade = -3 AND saldo_anterior = 2 AND saldo_novo = -1
                   AND chave_idempotencia IS NULL
                """, Long.class, item)).isEqualTo(1);
    }

    @Test
    void ajusteManualContinuaSemNegativo() throws Exception {
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "5.00").comEstoque("1")).id();
        baixar(new BaixaDeItem(pdv.idDoProduto(arroz), itemVendido(arroz, "2"), new BigDecimal("2.000")));

        mockMvc.perform(post("/api/produtos/" + arroz + "/estoque/ajustes")
                        .header("Authorization", cenario.token(empresa.admin()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tipo\":\"SAIDA\",\"quantidade\":1,\"motivo\":\"PERDA_AVARIA\",\"chave\":\""
                                + UUID.randomUUID() + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("quantidade"));
        mockMvc.perform(post("/api/produtos/" + arroz + "/estoque/ajustes")
                        .header("Authorization", cenario.token(empresa.admin()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tipo\":\"AJUSTE\",\"quantidade\":0,\"motivo\":\"CONTAGEM\",\"chave\":\""
                                + UUID.randomUUID() + "\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.saldoAnterior").value(-1.0))
                .andExpect(jsonPath("$.saldoNovo").value(0.0));
        assertThat(pdv.saldo(arroz)).isEqualByComparingTo("0");
    }

    @Test
    void baixaIgnoraProdutoSemControle() {
        UUID sacola = pdv.produto(empresa, NovoProduto.de("Sacola", "UN", "0.50").semControleDeEstoque()).id();

        baixar(new BaixaDeItem(pdv.idDoProduto(sacola), itemVendido(sacola, "1"), new BigDecimal("1.000")));

        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM movimentos_estoque WHERE produto_id = ?",
                Long.class, pdv.idDoProduto(sacola))).isZero();
        assertThat(pdv.saldo(sacola)).isEqualByComparingTo("0");
    }

    @Test
    void estornoDevolveSaldo() {
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "5.00").comEstoque("2")).id();
        UUID sacola = pdv.produto(empresa, NovoProduto.de("Sacola", "UN", "0.50").semControleDeEstoque()).id();
        BaixaDeItem doArroz = new BaixaDeItem(pdv.idDoProduto(arroz), itemVendido(arroz, "3"), new BigDecimal("3.000"));
        BaixaDeItem daSacola = new BaixaDeItem(pdv.idDoProduto(sacola), itemVendido(sacola, "1"), BigDecimal.ONE);
        baixar(doArroz, daSacola);

        naTransacao(() -> estoqueDaVenda.estornar(empresa.id(), empresa.operadora(), List.of(doArroz, daSacola)));

        assertThat(pdv.saldo(arroz)).isEqualByComparingTo("2");
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM movimentos_estoque WHERE item_venda_id = ? AND tipo = 'ENTRADA'
                   AND motivo = 'CANCELAMENTO_VENDA' AND origem = 'VENDA' AND quantidade = 3 AND saldo_novo = 2
                """, Long.class, doArroz.itemVendaId())).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM movimentos_estoque WHERE produto_id = ?",
                Long.class, pdv.idDoProduto(sacola))).isZero();
    }

    @Test
    void travaEmOrdemDeId() throws Exception {
        Long a = pdv.idDoProduto(pdv.produto(empresa, NovoProduto.de("Produto A", "UN", "1.00")).id());
        Long b = pdv.idDoProduto(pdv.produto(empresa, NovoProduto.de("Produto B", "UN", "1.00")).id());
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            for (int rodada = 0; rodada < RODADAS_CONCORRENTES; rodada++) {
                CyclicBarrier largada = new CyclicBarrier(2);
                List<Future<Object>> resultados = new ArrayList<>();
                for (List<Long> produtos : List.of(List.of(a, b), List.of(b, a))) {
                    resultados.add(executor.submit(() -> {
                        largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
                        naTransacao(() -> {
                            estoqueDaVenda.travarSaldos(empresa.id(), produtos);
                            pausa();
                        });
                        return null;
                    }));
                }
                for (Future<Object> resultado : resultados) {
                    resultado.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
                }
            }
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void travarSaldosDevolveZeroSemLinhaEIgnoraOutraEmpresa() {
        UUID comSaldo = pdv.produto(empresa, NovoProduto.de("Com saldo", "KG", "1.00").comEstoque("4.5")).id();
        UUID semSaldo = pdv.produto(empresa, NovoProduto.de("Sem saldo", "UN", "1.00")).id();
        EmpresaDoPdv outra = pdv.novaEmpresa();
        UUID daOutra = pdv.produto(outra, NovoProduto.de("Da outra", "UN", "1.00").comEstoque("9")).id();

        var saldos = new TransactionTemplate(gerenciadorDeTransacoes).execute(status -> estoqueDaVenda.travarSaldos(
                empresa.id(), List.of(pdv.idDoProduto(comSaldo), pdv.idDoProduto(semSaldo), pdv.idDoProduto(daOutra))));

        assertThat(saldos).containsOnlyKeys(pdv.idDoProduto(comSaldo), pdv.idDoProduto(semSaldo));
        assertThat(saldos.get(pdv.idDoProduto(comSaldo))).isEqualByComparingTo("4.5");
        assertThat(saldos.get(pdv.idDoProduto(semSaldo))).isEqualByComparingTo("0");
    }

    @Test
    void historicoDoProdutoMostraVendaECancelamento() throws Exception {
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "5.00").comEstoque("5")).id();
        BaixaDeItem baixa = new BaixaDeItem(pdv.idDoProduto(arroz), itemVendido(arroz, "2"), new BigDecimal("2.000"));
        baixar(baixa);
        naTransacao(() -> estoqueDaVenda.estornar(empresa.id(), empresa.operadora(), List.of(baixa)));

        mockMvc.perform(get("/api/produtos/" + arroz + "/estoque/movimentos")
                        .header("Authorization", cenario.token(empresa.operadora())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens[*].motivo", contains("CANCELAMENTO_VENDA", "VENDA", "ESTOQUE_INICIAL")))
                .andExpect(jsonPath("$.itens[0].origem").value("VENDA"))
                .andExpect(jsonPath("$.itens[0].usuarioNome").value("Ana Souza"));
        assertThat(MotivoMovimento.CANCELAMENTO_VENDA.rotulo()).isEqualTo("Cancelamento de venda");
        assertThat(MotivoMovimento.VENDA.rotulo()).isEqualTo("Venda");
        assertThat(MotivoMovimento.CANCELAMENTO_VENDA.manual()).isFalse();
        assertThat(MotivoMovimento.CANCELAMENTO_VENDA.tipos()).containsExactly(TipoMovimento.ENTRADA);
    }

    @Test
    void podeExcluirFalsoDepoisDeVenda() throws Exception {
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "5.00")).id();
        mockMvc.perform(get("/api/produtos/" + arroz).header("Authorization", cenario.token(empresa.admin())))
                .andExpect(jsonPath("$.podeExcluir").value(true));

        baixar(new BaixaDeItem(pdv.idDoProduto(arroz), itemVendido(arroz, "1"), BigDecimal.ONE));

        mockMvc.perform(get("/api/produtos/" + arroz).header("Authorization", cenario.token(empresa.admin())))
                .andExpect(jsonPath("$.podeExcluir").value(false));
    }

    // ---------- Apoio ----------

    private long itemVendido(UUID produto, String quantidade) {
        return pdv.itemVendidoPorJdbc(empresa, sessao, empresa.operadora(), produto, quantidade);
    }

    private void baixar(BaixaDeItem... baixas) {
        naTransacao(() -> estoqueDaVenda.baixar(empresa.id(), empresa.operadora(), List.of(baixas)));
    }

    private void naTransacao(Runnable acao) {
        new TransactionTemplate(gerenciadorDeTransacoes).executeWithoutResult(status -> acao.run());
    }

    /** Segura as travas um pouco, para as duas transacoes se cruzarem. */
    private static void pausa() {
        try {
            Thread.sleep(50);
        } catch (InterruptedException interrompida) {
            Thread.currentThread().interrupt();
        }
    }
}
