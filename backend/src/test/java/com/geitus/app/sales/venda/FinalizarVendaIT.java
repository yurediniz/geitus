package com.geitus.app.sales.venda;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.sales.CenarioDoPdv.EmpresaDoPdv;
import com.geitus.app.sales.CenarioDoPdv.NovaEmbalagem;
import com.geitus.app.sales.CenarioDoPdv.NovoProduto;
import com.geitus.app.sales.IntegracaoDoPdv;

/**
 * {@code POST /api/pdv/vendas} (docs/modules/pdv.md, 3.6 e 8): venda atomica
 * no caixa aberto do usuario, com o recalculo no servidor, a idempotencia pela
 * chave, o estoque baixado (inclusive negativo com "Vender sem estoque") e os
 * recebimentos por forma no caixa.
 */
class FinalizarVendaIT extends IntegracaoDoPdv {

    private EmpresaDoPdv empresa;

    @BeforeEach
    void criarEmpresa() {
        empresa = pdv.novaEmpresa();
    }

    @Test
    void vendaSimples201ComNumeroSequencial() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração X 1kg", "UN", "24.90")).id();

        finalizar(empresa.operadora(), vendaJson(item(racao, "3"), pagamento("DINHEIRO", "74.70"), "74.70",
                UUID.randomUUID()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.numero").value(1))
                .andExpect(jsonPath("$.status").value("CONCLUIDA"))
                .andExpect(jsonPath("$.sessaoId").value(sessao.toString()))
                .andExpect(jsonPath("$.pontoNome").value("Caixa 1"))
                .andExpect(jsonPath("$.vendedorNome").value("Ana Souza"))
                .andExpect(jsonPath("$.clienteNome").value(nullValue()))
                .andExpect(jsonPath("$.subtotal").value(74.7))
                .andExpect(jsonPath("$.total").value(74.7))
                .andExpect(jsonPath("$.troco").value(0.0))
                .andExpect(jsonPath("$.concluidaEm").value(endsWith("-03:00")))
                .andExpect(jsonPath("$.itens[0].ordem").value(1))
                .andExpect(jsonPath("$.itens[0].nome").value("Ração X 1kg"))
                .andExpect(jsonPath("$.itens[0].unidade").value("UN"))
                .andExpect(jsonPath("$.itens[0].origemPreco").value("NORMAL"))
                .andExpect(jsonPath("$.pagamentos[0].forma").value("DINHEIRO"))
                .andExpect(jsonPath("$.cancelamento").value(nullValue()))
                .andExpect(jsonPath("$.podeCancelar").value(true));
        finalizar(empresa.operadora(), vendaJson(item(racao, "1"), pagamento("PIX", "24.90"), "24.90",
                UUID.randomUUID()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.numero").value(2));
    }

    @Test
    void semCaixa409() throws Exception {
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();

        finalizar(empresa.operadora(), vendaJson(item(racao, "1"), pagamento("DINHEIRO", "10"), "10",
                UUID.randomUUID()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Abra o caixa para vender."));
    }

    @Test
    void caixaEmConferencia409() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        contar(empresa.operadora(), sessao, "90.00", null).andExpect(jsonPath("$.status").value("EM_CONFERENCIA"));
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();

        finalizar(empresa.operadora(), vendaJson(item(racao, "1"), pagamento("DINHEIRO", "10"), "10",
                UUID.randomUUID()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Termine o fechamento do caixa antes de vender."));
    }

    /** Review Focus 5: o ADMIN fecha o caixa da operadora em outra aba enquanto ela vende. */
    @Test
    void caixaFechadoPorAdminEmOutraAba409() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();
        contar(empresa.admin(), sessao, "100.00", null).andExpect(jsonPath("$.status").value("FECHADA"));

        finalizar(empresa.operadora(), vendaJson(item(racao, "1"), pagamento("DINHEIRO", "10"), "10",
                UUID.randomUUID()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Abra o caixa para vender."));
        assertThat(contarVendas()).isZero();
    }

    @Test
    void chaveRepetida200MesmaVenda() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00").comEstoque("5")).id();
        UUID chave = UUID.randomUUID();
        String pedido = vendaJson(item(racao, "2"), pagamento("DINHEIRO", "50"), "20.00", chave);
        String primeira = com.jayway.jsonpath.JsonPath.read(finalizar(empresa.operadora(), pedido)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");

        finalizar(empresa.operadora(), pedido)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(primeira))
                .andExpect(jsonPath("$.troco").value(30.0));
        assertThat(contarVendas()).isEqualTo(1);
        assertThat(pdv.saldo(racao)).isEqualByComparingTo("3");
    }

    @Test
    void chaveComOutrosDados409() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();
        UUID chave = UUID.randomUUID();
        finalizar(empresa.operadora(), vendaJson(item(racao, "2"), pagamento("DINHEIRO", "20"), "20", chave))
                .andExpect(status().isCreated());

        finalizar(empresa.operadora(), vendaJson(item(racao, "3"), pagamento("DINHEIRO", "30"), "30", chave))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Esta operação já foi registrada com outros dados."));
        assertThat(contarVendas()).isEqualTo(1);
    }

    @Test
    void totalMudou409() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();
        pdv.trocarPreco(racao, "12.00");

        finalizar(empresa.operadora(), vendaJson(item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00",
                UUID.randomUUID()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("O total da venda mudou. Confira os valores."))
                .andExpect(jsonPath("$.campos[0].campo").value("totalEsperado"));
        assertThat(contarVendas()).isZero();
    }

    @Test
    void semEstoqueDesligado409ComCampo() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        configurarPdv(empresa, false, "10");
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "5.00").comEstoque("10")).id();
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00").comEstoque("1")).id();

        finalizar(empresa.operadora(), vendaJson(item(arroz, "1") + "," + item(racao, "2"),
                pagamento("DINHEIRO", "25"), "25.00", UUID.randomUUID()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Estoque insuficiente para Ração (saldo 1 UN)."))
                .andExpect(jsonPath("$.campos[0].campo").value("itens[1]"));
        assertThat(pdv.saldo(racao)).isEqualByComparingTo("1");
        assertThat(pdv.saldo(arroz)).isEqualByComparingTo("10");
    }

    @Test
    void semEstoqueLigadoDeixaNegativo() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00").comEstoque("1")).id();

        vender(empresa.operadora(), item(racao, "3"), pagamento("DINHEIRO", "30"), "30.00");

        assertThat(pdv.saldo(racao)).isEqualByComparingTo("-2");
    }

    @Test
    void produtoSemControleSemMovimento() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        UUID sacola = pdv.produto(empresa, NovoProduto.de("Sacola", "UN", "0.50").semControleDeEstoque()).id();

        vender(empresa.operadora(), item(sacola, "2"), pagamento("DINHEIRO", "1"), "1.00");

        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM movimentos_estoque WHERE produto_id = ?",
                Long.class, pdv.idDoProduto(sacola))).isZero();
    }

    @Test
    void nexgardBaixa4ERecebe299_80() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        ProdutoResponse nexgard = pdv.produto(empresa, NovoProduto.de("Nexgard", "UN", "89.90").comEstoque("10")
                .comEmbalagens(new NovaEmbalagem("CX", "3", "209.90", List.of())));
        String itens = "{\"produtoId\":\"" + nexgard.id() + "\",\"embalagemId\":\"" + nexgard.embalagens().get(0).id()
                + "\",\"quantidade\":1}," + item(nexgard.id(), "1");

        finalizar(empresa.operadora(), vendaJson(itens, pagamento("DINHEIRO", "300"), "299.80", UUID.randomUUID()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.total").value(299.8))
                .andExpect(jsonPath("$.troco").value(0.2))
                .andExpect(jsonPath("$.itens[0].embalagemRotulo").value("CX c/ 3 UN"))
                .andExpect(jsonPath("$.itens[0].unidade").value("CX"))
                .andExpect(jsonPath("$.itens[0].origemPreco").value("EMBALAGEM"));

        assertThat(pdv.saldo(nexgard.id())).isEqualByComparingTo("6");
        assertThat(recebimentos(sessao)).containsExactly(Map.entry("DINHEIRO", new BigDecimal("299.80")));
    }

    @Test
    void pagamentoDivididoComTrocoRecebeLiquidoEmDinheiro() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "24.90")).id();

        finalizar(empresa.operadora(), vendaJson(item(racao, "3"), pagamento("DINHEIRO", "60") + ","
                + pagamento("PIX", "20"), "74.70", UUID.randomUUID()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.troco").value(5.3))
                .andExpect(jsonPath("$.pagamentos", hasSize(2)));

        assertThat(recebimentos(sessao)).containsExactly(Map.entry("DINHEIRO", new BigDecimal("54.70")),
                Map.entry("PIX", new BigDecimal("20.00")));
        detalhe(empresa.admin(), sessao)
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(154.7))
                .andExpect(jsonPath("$.formasDaContagem[1]").value("PIX"))
                .andExpect(jsonPath("$.movimentos[?(@.tipo == 'RECEBIMENTO')].vendaNumero",
                        org.hamcrest.Matchers.contains(1, 1)));
    }

    /** Review Focus 2: produto inativado entre o bipe e o finalizar. */
    @Test
    void produtoInativadoAntesDeFinalizar409ItensI() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "5.00")).id();
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();
        pdv.inativarProduto(empresa, racao);

        finalizar(empresa.operadora(), vendaJson(item(arroz, "1") + "," + item(racao, "1"),
                pagamento("DINHEIRO", "15"), "15.00", UUID.randomUUID()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Produto inativo — não pode ser vendido."))
                .andExpect(jsonPath("$.campos[0].campo").value("itens[1]"));
        assertThat(contarVendas()).isZero();
    }

    /** Review Focus 2: a embalagem saiu do produto entre o bipe e o finalizar. */
    @Test
    void embalagemRemovidaAntesDeFinalizar404ItensI() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        NovoProduto nexgard = NovoProduto.de("Nexgard", "UN", "89.90");
        ProdutoResponse produto = pdv.produto(empresa, nexgard.comEmbalagens(
                new NovaEmbalagem("CX", "3", "209.90", List.of())));
        UUID caixa = produto.embalagens().get(0).id();
        pdv.atualizarProduto(empresa, produto.id(), nexgard);

        finalizar(empresa.operadora(), vendaJson("{\"produtoId\":\"" + produto.id() + "\",\"embalagemId\":\"" + caixa
                + "\",\"embalagemRotulo\":\"CX c/ 3 UN\",\"quantidade\":1}", pagamento("DINHEIRO", "209.90"),
                "209.90", UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("A embalagem CX c/ 3 UN não existe mais."))
                .andExpect(jsonPath("$.campos[0].campo").value("itens[0]"));
    }

    @Test
    void clienteFotografado() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();
        UUID cliente = pdv.cliente(empresa, "Maria Lima", true);
        String pedido = "{\"itens\":[" + item(racao, "1") + "],\"clienteId\":\"" + cliente + "\",\"pagamentos\":["
                + pagamento("DINHEIRO", "10") + "],\"chave\":\"" + UUID.randomUUID() + "\",\"totalEsperado\":10}";
        String venda = com.jayway.jsonpath.JsonPath.read(finalizar(empresa.operadora(), pedido)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.clienteNome").value("Maria Lima"))
                .andReturn().getResponse().getContentAsString(), "$.id");

        jdbcTemplate.update("UPDATE clientes SET nome = 'Maria Souza', ativo = false WHERE uuid = ?", cliente);

        venda(empresa.operadora(), venda).andExpect(jsonPath("$.clienteNome").value("Maria Lima"));
    }

    @Test
    void itensComFotografiaECustoNoBancoERespostaSemCusto() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "24.90").comCusto("12.34").comCodigo(542))
                .id();
        String pedido = vendaJson("{\"produtoId\":\"" + racao + "\",\"quantidade\":2,\"codigoLido\":\"542*2\","
                + "\"desconto\":{\"tipo\":\"VALOR\",\"valor\":1.80}}", pagamento("DINHEIRO", "48"), "48.00",
                UUID.randomUUID());

        String corpo = finalizar(empresa.operadora(), pedido)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.itens[0].codigoLido").value("542*2"))
                .andExpect(jsonPath("$.itens[0].descontoItem").value(1.8))
                .andReturn().getResponse().getContentAsString();

        assertThat(corpo).doesNotContain("custo").doesNotContain("12.34");
        Map<String, Object> item = jdbcTemplate.queryForMap("""
                SELECT produto_nome, codigo_lido, unidade_sigla, quantidade, quantidade_estoque, preco_unitario,
                       origem_preco, valor_bruto, desconto_item, desconto_rateado, valor_liquido, custo_unitario
                  FROM itens_venda i JOIN vendas v ON v.id = i.venda_id WHERE v.empresa_id = ?
                """, empresa.id());
        assertThat(item).containsEntry("produto_nome", "Ração").containsEntry("codigo_lido", "542*2")
                .containsEntry("unidade_sigla", "UN").containsEntry("origem_preco", "NORMAL");
        assertThat((BigDecimal) item.get("custo_unitario")).isEqualByComparingTo("12.3400");
        assertThat((BigDecimal) item.get("valor_liquido")).isEqualByComparingTo("48.00");
    }

    @Test
    void regraDoCarrinhoViolada400ComCampos() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();

        finalizar(empresa.operadora(), vendaJson(item(racao, "1"), pagamento("DINHEIRO", "5"), "10.00",
                UUID.randomUUID()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Falta pagar R$ 5,00."))
                .andExpect(jsonPath("$.campos[0].campo").value("pagamentos"));
        finalizar(empresa.operadora(), vendaJson(item(racao, "1"), "", "10.00", UUID.randomUUID()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Falta pagar R$ 10,00."));
        assertThat(contarVendas()).isZero();
    }

    /** SEG-I1: o limite de linhas vem antes das travas (sem caixa aberto, o 400 sai antes do 409 do caixa). */
    @Test
    void maisDeTrezentasLinhas400AntesDasTravas() throws Exception {
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "1.00")).id();
        String trezentasEUma = String.join(",", java.util.Collections.nCopies(301, item(racao, "1")));
        String trezentasEDuas = String.join(",", java.util.Collections.nCopies(302, item(racao, "1")));

        finalizar(empresa.operadora(), vendaJson(trezentasEUma, pagamento("DINHEIRO", "301"), "301.00",
                UUID.randomUUID()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("A venda atingiu o limite de 300 itens."))
                .andExpect(jsonPath("$.campos[0].campo").value("itens"));
        finalizar(empresa.operadora(), vendaJson(trezentasEDuas, pagamento("DINHEIRO", "302"), "302.00",
                UUID.randomUUID()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("itens"));
    }

    /** SEG-1: valores gigantes no desconto e no total esperado respondem 400 rapido. */
    @Test
    void valoresGigantes400() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();
        long inicio = System.nanoTime();

        finalizar(empresa.operadora(), vendaJson("{\"produtoId\":\"" + racao + "\",\"quantidade\":1,\"desconto\":"
                + "{\"tipo\":\"VALOR\",\"valor\":1E+100000000}}", pagamento("DINHEIRO", "10"), "10.00",
                UUID.randomUUID()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("itens[0].desconto.valor"));
        finalizar(empresa.operadora(), "{\"itens\":[" + item(racao, "1") + "],\"desconto\":{\"tipo\":\"VALOR\","
                + "\"valor\":1E+100000000},\"pagamentos\":[" + pagamento("DINHEIRO", "10") + "],\"chave\":\""
                + UUID.randomUUID() + "\",\"totalEsperado\":10}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("desconto.valor"));
        finalizar(empresa.operadora(), vendaJson(item(racao, "1"), pagamento("DINHEIRO", "1E+100000000"),
                "1E+100000000", UUID.randomUUID()))
                .andExpect(status().isBadRequest());

        assertThat(java.time.Duration.ofNanos(System.nanoTime() - inicio)).isLessThan(java.time.Duration.ofSeconds(5));
        assertThat(contarVendas()).isZero();
    }

    @Test
    void chaveRepetidaPorOutroUsuarioDaEmpresa409() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
        Long bruno = cenario.novoUsuario(empresa.caixa(), "Bruno Lima", "OPERADOR");
        abrirCaixa(bruno, cenario.novoPonto(empresa.caixa(), "Caixa 2"), "0.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();
        UUID chave = UUID.randomUUID();
        String pedido = vendaJson(item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00", chave);
        finalizar(empresa.operadora(), pedido).andExpect(status().isCreated());

        finalizar(bruno, pedido)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Esta operação já foi registrada com outros dados."));
        assertThat(contarVendas()).isEqualTo(1);
    }

    @Test
    void clienteDeOutraEmpresa404() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();
        UUID daOutra = pdv.cliente(pdv.novaEmpresa(), "Cliente de outra", true);

        finalizar(empresa.operadora(), "{\"itens\":[" + item(racao, "1") + "],\"clienteId\":\"" + daOutra
                + "\",\"pagamentos\":[" + pagamento("DINHEIRO", "10") + "],\"chave\":\"" + UUID.randomUUID()
                + "\",\"totalEsperado\":10}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Cliente não encontrado."))
                .andExpect(jsonPath("$.campos[0].campo").value("clienteId"));
        assertThat(contarVendas()).isZero();
    }

    @Test
    void pagamentosGravadosNormalizados() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();

        finalizar(empresa.operadora(), vendaJson(item(racao, "1"), pagamento("PIX", "4.5") + ","
                + pagamento("DINHEIRO", "5.5"), "10", UUID.randomUUID()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.pagamentos[0].forma").value("DINHEIRO"))
                .andExpect(jsonPath("$.pagamentos[1].forma").value("PIX"));
        assertThat(jdbcTemplate.queryForList("""
                SELECT p.valor::text FROM pagamentos_venda p JOIN vendas v ON v.id = p.venda_id
                 WHERE v.empresa_id = ? ORDER BY p.forma
                """, String.class, empresa.id())).containsExactly("5.50", "4.50");
    }

    // ---------- Apoio ----------

    private long contarVendas() {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM vendas WHERE empresa_id = ?", Long.class,
                empresa.id());
    }

    /** Os recebimentos da sessao por forma, na ordem da forma. */
    private List<Map.Entry<String, BigDecimal>> recebimentos(UUID sessao) {
        return jdbcTemplate.query("""
                SELECT forma, valor FROM movimentos_caixa
                 WHERE sessao_caixa_id = (SELECT id FROM sessoes_caixa WHERE uuid = ?) AND tipo = 'RECEBIMENTO'
                 ORDER BY CASE forma WHEN 'DINHEIRO' THEN 1 WHEN 'DEBITO' THEN 2 WHEN 'CREDITO' THEN 3 ELSE 4 END
                """, (linha, numero) -> Map.entry(linha.getString("forma"), linha.getBigDecimal("valor")), sessao);
    }
}
