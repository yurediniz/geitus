package com.geitus.app.cashier.sessao;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.EnumMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.geitus.app.cashier.CaixaConflitoException;
import com.geitus.app.cashier.CenarioDeCaixa.EmpresaDeCaixa;
import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.cashier.IntegracaoDoCaixa;
import com.geitus.app.cashier.RecebimentosDoCaixa;
import com.geitus.app.iam.ResolvedorDoUsuarioAutenticado;

/**
 * Caixa conferido por forma de pagamento (docs/modules/pdv.md, 3.8, 3.9 e 8):
 * esperado por forma, formas da contagem, contagem com o contrato novo,
 * conferencia com diferenca so no cartao, modo cego por forma e as travas e
 * estornos que o PDV usa. Os recebimentos entram pelo {@link RecebimentosDoCaixa}
 * direto, numa transacao do teste, com uma venda gravada por JDBC (a FK do
 * movimento exige a venda da mesma sessao).
 */
class ContagemPorFormaIT extends IntegracaoDoCaixa {

    private static final AtomicLong NUMERO_DA_VENDA = new AtomicLong();

    @Autowired
    private RecebimentosDoCaixa recebimentos;

    @Autowired
    private ResolvedorDoUsuarioAutenticado resolvedor;

    @Autowired
    private PlatformTransactionManager gerenciadorDeTransacoes;

    private EmpresaDeCaixa empresa;
    private UUID caixa1;
    private long produto;

    @BeforeEach
    void criarEmpresa() throws Exception {
        empresa = cenario.novaEmpresa();
        caixa1 = cenario.novoPonto(empresa, "Caixa 1");
        jdbcTemplate.update("INSERT INTO unidades_medida (empresa_id, sigla, descricao, fracionada) VALUES (?, 'UN',"
                + " 'Unidade', false)", empresa.id());
        produto = jdbcTemplate.queryForObject("""
                INSERT INTO produtos (empresa_id, numero, nome, preco_venda, unidade_id, busca_normalizada,
                                      nome_normalizado)
                VALUES (?, 1, 'Produto', 1.00, (SELECT id FROM unidades_medida WHERE empresa_id = ?), 'produto',
                        'produto')
                RETURNING id
                """, Long.class, empresa.id(), empresa.id());
    }

    // ---------- Esperado e formas da contagem ----------

    @Test
    void esperadoPorForma() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        receber(sessao, Map.of(FormaDePagamento.DINHEIRO, "30.00", FormaDePagamento.PIX, "20.00"));
        long cancelada = receber(sessao, Map.of(FormaDePagamento.DINHEIRO, "10.00"));
        estornar(sessao, cancelada, false);

        detalhe(empresa.admin(), sessao)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(130.0))
                .andExpect(jsonPath("$.formasDaContagem", contains("DINHEIRO", "PIX")))
                .andExpect(jsonPath("$.porForma[0].forma").value("DINHEIRO"))
                .andExpect(jsonPath("$.porForma[0].esperado").value(130.0))
                .andExpect(jsonPath("$.porForma[0].contado").value(nullValue()))
                .andExpect(jsonPath("$.porForma[1].forma").value("PIX"))
                .andExpect(jsonPath("$.porForma[1].esperado").value(20.0))
                .andExpect(jsonPath("$.movimentos[?(@.tipo == 'ESTORNO')].forma", contains("DINHEIRO")))
                .andExpect(jsonPath("$.movimentos[?(@.tipo == 'RECEBIMENTO')]", hasSize(3)));
        historico(empresa.admin(), "")
                .andExpect(jsonPath("$.itens[0].porForma[1].esperado").value(20.0))
                .andExpect(jsonPath("$.itens[0].formasDaContagem", contains("DINHEIRO", "PIX")));
    }

    @Test
    void sangriaLimitadaAoDinheiro() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "10.00");
        receber(sessao, Map.of(FormaDePagamento.PIX, "50.00"));

        lancar(empresa.admin(), sessao, "SANGRIA", "20.00")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("A sangria passa do dinheiro na gaveta (R$ 10,00)."));
    }

    @Test
    void formasDaContagemSoComMovimento() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        detalhe(empresa.admin(), sessao).andExpect(jsonPath("$.formasDaContagem", contains("DINHEIRO")));

        receber(sessao, Map.of(FormaDePagamento.DEBITO, "20.00"));

        detalhe(empresa.admin(), sessao).andExpect(jsonPath("$.formasDaContagem", contains("DINHEIRO", "DEBITO")));
    }

    // ---------- Contagem (contrato novo) ----------

    @Test
    void formaFaltando400() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        receber(sessao, Map.of(FormaDePagamento.DEBITO, "20.00"));

        contarPorForma(empresa.operadora(), sessao, "{\"DINHEIRO\":100}", null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Informe o valor contado de Débito."))
                .andExpect(jsonPath("$.campos[0].campo").value("contagens.DEBITO"));
        detalhe(empresa.operadora(), sessao).andExpect(jsonPath("$.status").value("ABERTA"));
    }

    @Test
    void formaSemMovimento400() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");

        contarPorForma(empresa.operadora(), sessao, "{\"DINHEIRO\":100,\"PIX\":0}", null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("PIX não teve movimento neste caixa."))
                .andExpect(jsonPath("$.campos[0].campo").value("contagens.PIX"));
        contarPorForma(empresa.operadora(), sessao, "{\"DINHEIRO\":100,\"VALE\":0}", null)
                .andExpect(status().isBadRequest());
    }

    @Test
    void todasZeroFecha() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        receber(sessao, Map.of(FormaDePagamento.DEBITO, "20.00", FormaDePagamento.DINHEIRO, "5.00"));

        contarPorForma(empresa.operadora(), sessao, "{\"DINHEIRO\":105,\"DEBITO\":20.00}", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"))
                .andExpect(jsonPath("$.diferenca").value(0.0))
                .andExpect(jsonPath("$.porForma[1].forma").value("DEBITO"))
                .andExpect(jsonPath("$.porForma[1].esperado").value(20.0))
                .andExpect(jsonPath("$.porForma[1].contado").value(20.0))
                .andExpect(jsonPath("$.porForma[1].diferenca").value(0.0));
    }

    @Test
    void diferencaSoNoCartaoVaiParaConferenciaNoCego() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        receber(sessao, Map.of(FormaDePagamento.DEBITO, "20.00"));

        contarPorForma(empresa.operadora(), sessao, "{\"DINHEIRO\":100,\"DEBITO\":15}", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("EM_CONFERENCIA"))
                .andExpect(jsonPath("$.diferenca").value(0.0))
                .andExpect(jsonPath("$.porForma[0].diferenca").value(0.0))
                .andExpect(jsonPath("$.porForma[1].esperado").value(20.0))
                .andExpect(jsonPath("$.porForma[1].diferenca").value(-5.0));
        fechar(empresa.operadora(), sessao, "Comprovante perdido")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"));
        historico(empresa.operadora(), "")
                .andExpect(jsonPath("$.itens[0].porForma[1].contado").value(15.0));
    }

    @Test
    void naoCegoComJustificativaFecha() throws Exception {
        fechamentoCego(empresa, false);
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        receber(sessao, Map.of(FormaDePagamento.CREDITO, "40.00"));

        contarPorForma(empresa.operadora(), sessao, "{\"DINHEIRO\":100,\"CREDITO\":41}", " Sobra no crédito ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"))
                .andExpect(jsonPath("$.justificativa").value("Sobra no crédito"))
                .andExpect(jsonPath("$.porForma[1].diferenca").value(1.0));
    }

    @Test
    void contagemRepetidaMesmosValores200() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        receber(sessao, Map.of(FormaDePagamento.DEBITO, "20.00"));
        contarPorForma(empresa.operadora(), sessao, "{\"DINHEIRO\":100,\"DEBITO\":15}", null)
                .andExpect(status().isOk());

        contarPorForma(empresa.operadora(), sessao, "{\"DINHEIRO\":100.00,\"DEBITO\":15.0}", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("EM_CONFERENCIA"));
    }

    @Test
    void outrosValores409() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        receber(sessao, Map.of(FormaDePagamento.DEBITO, "20.00"));
        contarPorForma(empresa.operadora(), sessao, "{\"DINHEIRO\":100,\"DEBITO\":15}", null)
                .andExpect(status().isOk());

        contarPorForma(empresa.operadora(), sessao, "{\"DINHEIRO\":100,\"DEBITO\":16}", null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("A contagem deste caixa já foi registrada."));
    }

    // ---------- Modo cego por forma ----------

    @Test
    void cegoOperadorSemEsperadoDeNenhumaForma() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        receber(sessao, Map.of(FormaDePagamento.DEBITO, "20.00", FormaDePagamento.PIX, "5.00"));

        detalhe(empresa.operadora(), sessao)
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(nullValue()))
                .andExpect(jsonPath("$.formasDaContagem", contains("DINHEIRO", "DEBITO", "PIX")))
                .andExpect(jsonPath("$.porForma[*].esperado", everyItem(nullValue())))
                .andExpect(jsonPath("$.porForma", hasSize(3)));
        atual(empresa.operadora()).andExpect(jsonPath("$.porForma[*].esperado", everyItem(nullValue())));
        historico(empresa.operadora(), "").andExpect(jsonPath("$.itens[0].porForma[*].esperado",
                everyItem(nullValue())));
    }

    @Test
    void recebimentoEEstornoComValorNuloParaOperadorNoCego() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        long venda = receber(sessao, Map.of(FormaDePagamento.DINHEIRO, "30.00"));
        estornar(sessao, venda, true);

        detalhe(empresa.operadora(), sessao)
                .andExpect(jsonPath("$.movimentos[?(@.tipo == 'RECEBIMENTO')].valor", contains(nullValue())))
                .andExpect(jsonPath("$.movimentos[?(@.tipo == 'ESTORNO')].valor", contains(nullValue())))
                .andExpect(jsonPath("$.movimentos[?(@.tipo == 'ABERTURA')].valor", contains(100.0)));
        detalhe(empresa.admin(), sessao)
                .andExpect(jsonPath("$.movimentos[?(@.tipo == 'RECEBIMENTO')].valor", contains(30.0)))
                .andExpect(jsonPath("$.movimentos[?(@.tipo == 'RECEBIMENTO')].forma", contains("DINHEIRO")));
        fechamentoCego(empresa, false);
        detalhe(empresa.operadora(), sessao)
                .andExpect(jsonPath("$.movimentos[?(@.tipo == 'RECEBIMENTO')].valor", contains(30.0)));
    }

    // ---------- Travas e estornos do PDV ----------

    @Test
    void travarSessaoParaVendaSemCaixa409() {
        assertThatThrownBy(() -> naTransacao(() -> recebimentos.travarSessaoParaVenda(
                resolvedor.resolver(empresa.operadora()))))
                .isInstanceOf(CaixaConflitoException.class)
                .hasMessage("Abra o caixa para vender.");
    }

    @Test
    void emConferencia409() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        contar(empresa.operadora(), sessao, "90.00", null).andExpect(jsonPath("$.status").value("EM_CONFERENCIA"));

        assertThatThrownBy(() -> naTransacao(() -> recebimentos.travarSessaoParaVenda(
                resolvedor.resolver(empresa.operadora()))))
                .isInstanceOf(CaixaConflitoException.class)
                .hasMessage("Termine o fechamento do caixa antes de vender.");
    }

    @Test
    void estornoDinheiroAcimaDaGaveta409() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "10.00");
        long venda = receber(sessao, Map.of(FormaDePagamento.DINHEIRO, "30.00"));
        lancar(empresa.admin(), sessao, "SANGRIA", "35.00").andExpect(status().isCreated());

        assertThatThrownBy(() -> estornar(sessao, venda, false))
                .isInstanceOf(CaixaConflitoException.class)
                .hasMessage("Não há dinheiro suficiente na gaveta para devolver (R$ 5,00).");
        assertThatThrownBy(() -> estornar(sessao, venda, true))
                .isInstanceOf(CaixaConflitoException.class)
                .hasMessage("Não há dinheiro suficiente na gaveta para devolver.");
        detalhe(empresa.admin(), sessao).andExpect(jsonPath("$.dinheiroNaGaveta").value(5.0));
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    /**
     * Venda coerente gravada por JDBC na sessao (um item e os pagamentos por
     * forma, num comando so: tg_venda_coerente da V17) e os recebimentos dela
     * pelo {@link RecebimentosDoCaixa}; devolve o id.
     */
    private long receber(UUID sessao, Map<FormaDePagamento, String> valores) {
        long sessaoId = idDaSessao(sessao);
        BigDecimal total = valores.values().stream().map(BigDecimal::new).reduce(BigDecimal.ZERO, BigDecimal::add);
        String pagamentos = emReais(valores).entrySet().stream()
                .map(pagamento -> "('" + pagamento.getKey().name() + "', " + pagamento.getValue().toPlainString() + ")")
                .collect(java.util.stream.Collectors.joining(", "));
        long venda = jdbcTemplate.queryForObject("""
                WITH v AS (
                    INSERT INTO vendas (uuid, empresa_id, numero, sessao_caixa_id, usuario_id, status, subtotal,
                                        desconto_itens, desconto_total, total, troco, chave_idempotencia,
                                        concluida_em)
                    VALUES (gen_random_uuid(), ?, ?, ?, ?, 'CONCLUIDA', ?, 0, 0, ?, 0, gen_random_uuid(), now())
                    RETURNING id, empresa_id, total),
                i AS (
                    INSERT INTO itens_venda (empresa_id, venda_id, ordem, produto_id, produto_nome, unidade_sigla,
                                             etiqueta, quantidade, quantidade_estoque, preco_unitario, origem_preco,
                                             valor_bruto, desconto_item, desconto_rateado, valor_liquido)
                    SELECT v.empresa_id, v.id, 1, ?, 'Produto', 'UN', false, 1, 1, v.total, 'NORMAL', v.total, 0, 0,
                           v.total
                      FROM v),
                p AS (
                    INSERT INTO pagamentos_venda (empresa_id, venda_id, forma, valor)
                    SELECT v.empresa_id, v.id, f.forma, f.valor FROM v, (VALUES %s) AS f(forma, valor))
                SELECT id FROM v
                """.formatted(pagamentos), Long.class, empresa.id(), NUMERO_DA_VENDA.incrementAndGet(), sessaoId,
                empresa.operadora(), total, total, produto);
        naTransacao(() -> {
            recebimentos.registrarRecebimentos(empresa.id(), sessaoId, venda, empresa.operadora(), emReais(valores));
            return null;
        });
        return venda;
    }

    /**
     * O cancelamento da venda no caixa: estorna os recebimentos gravados dela e
     * cancela a venda na mesma transacao (a V17 confere os dois no commit).
     */
    private void estornar(UUID sessao, long venda, boolean escondeValor) {
        long sessaoId = idDaSessao(sessao);
        naTransacao(() -> {
            recebimentos.travarSessaoDaVenda(empresa.id(), sessaoId);
            recebimentos.registrarEstornos(empresa.id(), sessaoId, venda, empresa.operadora(), escondeValor);
            jdbcTemplate.update("UPDATE vendas SET status = 'CANCELADA', cancelada_por = ?, cancelada_em = now(),"
                    + " motivo_cancelamento = 'Teste' WHERE id = ?", empresa.operadora(), venda);
            return null;
        });
    }

    private static Map<FormaDePagamento, BigDecimal> emReais(Map<FormaDePagamento, String> valores) {
        Map<FormaDePagamento, BigDecimal> emReais = new EnumMap<>(FormaDePagamento.class);
        valores.forEach((forma, valor) -> emReais.put(forma, new BigDecimal(valor)));
        return emReais;
    }

    private long idDaSessao(UUID sessao) {
        return jdbcTemplate.queryForObject("SELECT id FROM sessoes_caixa WHERE uuid = ?", Long.class, sessao);
    }

    private <T> T naTransacao(java.util.function.Supplier<T> acao) {
        return new TransactionTemplate(gerenciadorDeTransacoes).execute(status -> acao.get());
    }
}
