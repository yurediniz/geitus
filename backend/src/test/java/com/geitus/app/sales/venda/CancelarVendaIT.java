package com.geitus.app.sales.venda;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.endsWith;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.geitus.app.sales.CenarioDoPdv.EmpresaDoPdv;
import com.geitus.app.sales.CenarioDoPdv.NovoProduto;
import com.geitus.app.sales.IntegracaoDoPdv;

/**
 * {@code POST /api/pdv/vendas/{id}/cancelamento} (docs/modules/pdv.md, 3.8 e
 * 8): so com o caixa da venda aberto, pelo dono da sessao ou pelo ADMIN, com
 * os estornos de estoque e de caixa na mesma transacao.
 */
class CancelarVendaIT extends IntegracaoDoPdv {

    private EmpresaDoPdv empresa;
    private UUID sessao;
    private UUID racao;

    @BeforeEach
    void venderAntes() throws Exception {
        empresa = pdv.novaEmpresa();
        sessao = abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00").comEstoque("5")).id();
    }

    @Test
    void cancelaEstornaEstoqueECaixa() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "2"), pagamento("DINHEIRO", "15") + ","
                + pagamento("PIX", "10"), "20.00");
        assertThat(pdv.saldo(racao)).isEqualByComparingTo("3");

        cancelar(empresa.operadora(), venda, "  Cliente desistiu ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELADA"))
                .andExpect(jsonPath("$.cancelamento.canceladaPorNome").value("Ana Souza"))
                .andExpect(jsonPath("$.cancelamento.canceladaEm").value(endsWith("-03:00")))
                .andExpect(jsonPath("$.cancelamento.motivo").value("Cliente desistiu"))
                .andExpect(jsonPath("$.podeCancelar").value(false));

        assertThat(pdv.saldo(racao)).isEqualByComparingTo("5");
        assertThat(movimentos("ESTORNO")).containsExactlyInAnyOrder("DINHEIRO 10.00", "PIX 10.00");
        detalhe(empresa.admin(), sessao).andExpect(jsonPath("$.dinheiroNaGaveta").value(100.0))
                .andExpect(jsonPath("$.porForma[1].esperado").value(0.0));
    }

    /** DADOS-I5: o estorno de estoque pode deixar o saldo ainda negativo (-10 + 5 = -5). */
    @Test
    void cancelamentoComSaldoAindaNegativo() throws Exception {
        UUID semEstoque = pdv.produto(empresa, NovoProduto.de("Ração sem estoque", "UN", "10.00")).id();
        vender(empresa.operadora(), item(semEstoque, "5"), pagamento("DINHEIRO", "50"), "50.00");
        String segunda = vender(empresa.operadora(), item(semEstoque, "5"), pagamento("DINHEIRO", "50"), "50.00");
        assertThat(pdv.saldo(semEstoque)).isEqualByComparingTo("-10");

        cancelar(empresa.operadora(), segunda, "Desistiu").andExpect(status().isOk());

        assertThat(pdv.saldo(semEstoque)).isEqualByComparingTo("-5");
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM movimentos_estoque m JOIN produtos p ON p.id = m.produto_id
                 WHERE p.uuid = ? AND m.motivo = 'CANCELAMENTO_VENDA' AND m.saldo_anterior = -10 AND m.saldo_novo = -5
                """, Long.class, semEstoque)).isEqualTo(1);
    }

    /** QA A2: com o caixa em conferencia, o cancelamento e recusado e nada muda no estoque nem no caixa. */
    @Test
    void caixaEmConferencia409() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "2"), pagamento("DINHEIRO", "20"), "20.00");
        contar(empresa.operadora(), sessao, "110.00", null).andExpect(jsonPath("$.status").value("EM_CONFERENCIA"));
        long movimentosDeCaixa = contarLinhas("movimentos_caixa");
        long movimentosDeEstoque = contarLinhas("movimentos_estoque");

        cancelar(empresa.admin(), venda, "Erro")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(
                        "Esta venda é de um caixa que já foi fechado ou está em conferência. Use devolução."));

        assertThat(pdv.saldo(racao)).isEqualByComparingTo("3");
        assertThat(contarLinhas("movimentos_caixa")).isEqualTo(movimentosDeCaixa);
        assertThat(contarLinhas("movimentos_estoque")).isEqualTo(movimentosDeEstoque);
        venda(empresa.admin(), venda).andExpect(jsonPath("$.status").value("CONCLUIDA"));
    }

    /** QA A3: CX + UN + etiqueta; o cancelamento devolve exatamente o que cada baixa tirou (3, 1 e 0,400). */
    @Test
    void cancelarNexgardCxMaisUnEEtiquetaDevolveOEstoqueDaBaixa() throws Exception {
        com.geitus.app.catalog.dto.ProdutoResponse nexgard = pdv.produto(empresa, NovoProduto.de("Nexgard", "UN",
                "89.90").comEstoque("10").comEmbalagens(new com.geitus.app.sales.CenarioDoPdv.NovaEmbalagem("CX", "3",
                "209.90", List.of())));
        UUID queijo = pdv.produto(empresa, NovoProduto.de("Queijo", "KG", "25.00").naBalanca(542).comEstoque("2"))
                .id();
        String itens = "{\"produtoId\":\"" + nexgard.id() + "\",\"embalagemId\":\"" + nexgard.embalagens().get(0).id()
                + "\",\"quantidade\":1}," + item(nexgard.id(), "1") + ",{\"produtoId\":\"" + queijo
                + "\",\"codigoLido\":\"2000542010000\",\"etiqueta\":true}";
        String venda = vender(empresa.operadora(), itens, pagamento("DINHEIRO", "310"), "309.80");
        assertThat(pdv.saldo(nexgard.id())).isEqualByComparingTo("6");
        assertThat(pdv.saldo(queijo)).isEqualByComparingTo("1.6");

        cancelar(empresa.operadora(), venda, "Desistiu").andExpect(status().isOk());

        assertThat(jdbcTemplate.queryForList("""
                SELECT m.quantidade FROM movimentos_estoque m JOIN itens_venda i ON i.id = m.item_venda_id
                 JOIN vendas v ON v.id = i.venda_id
                 WHERE v.uuid = ? AND m.motivo = 'CANCELAMENTO_VENDA' ORDER BY i.ordem
                """, BigDecimal.class, UUID.fromString(venda)))
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("3"), new BigDecimal("1"), new BigDecimal("0.400"));
        assertThat(pdv.saldo(nexgard.id())).isEqualByComparingTo("10");
        assertThat(pdv.saldo(queijo)).isEqualByComparingTo("2");
    }

    /** QA A4: PIX cancelado (esperado 0) continua na contagem; sem ele, 400; com PIX 0, fecha. */
    @Test
    void fechamentoComVendaCanceladaEmPix() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("PIX", "10"), "10.00");
        cancelar(empresa.operadora(), venda, "Desistiu").andExpect(status().isOk());

        detalhe(empresa.admin(), sessao)
                .andExpect(jsonPath("$.formasDaContagem", org.hamcrest.Matchers.contains("DINHEIRO", "PIX")))
                .andExpect(jsonPath("$.porForma[1].esperado").value(0.0));
        contarPorForma(empresa.operadora(), sessao, "{\"DINHEIRO\":100}", null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Informe o valor contado de PIX."));
        contarPorForma(empresa.operadora(), sessao, "{\"DINHEIRO\":100,\"PIX\":0}", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"));
    }

    /** QA A9: o estorno igual ao dinheiro da gaveta passa; o PIX nao depende da gaveta. */
    @Test
    void estornoIgualAoDinheiroDaGavetaPassaEPixNaoDependeDaGaveta() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "2"), pagamento("DINHEIRO", "10") + ","
                + pagamento("PIX", "10"), "20.00");
        lancar(empresa.admin(), sessao, "SANGRIA", "100.00").andExpect(status().isCreated());
        detalhe(empresa.admin(), sessao).andExpect(jsonPath("$.dinheiroNaGaveta").value(10.0));

        cancelar(empresa.operadora(), venda, "Desistiu").andExpect(status().isOk());

        detalhe(empresa.admin(), sessao)
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(0.0))
                .andExpect(jsonPath("$.porForma[1].forma").value("PIX"))
                .andExpect(jsonPath("$.porForma[1].esperado").value(0.0));
    }

    private long contarLinhas(String tabela) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM " + tabela + " WHERE empresa_id = ?", Long.class,
                empresa.id());
    }

    @Test
    void caixaFechado409() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("PIX", "10"), "10.00");
        contarPorForma(empresa.operadora(), sessao, "{\"DINHEIRO\":100,\"PIX\":10}", null)
                .andExpect(jsonPath("$.status").value("FECHADA"));

        cancelar(empresa.admin(), venda, "Erro")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(
                        "Esta venda é de um caixa que já foi fechado ou está em conferência. Use devolução."));
        assertThat(pdv.saldo(racao)).isEqualByComparingTo("4");
    }

    @Test
    void operadorEmVendaDeOutro404() throws Exception {
        Long bruno = cenario.novoUsuario(empresa.caixa(), "Bruno Lima", "OPERADOR");
        abrirCaixa(bruno, cenario.novoPonto(empresa.caixa(), "Caixa 2"), "0.00");
        String vendaDoBruno = vender(bruno, item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");

        cancelar(empresa.operadora(), vendaDoBruno, "Erro")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Venda não encontrada."));
        venda(empresa.operadora(), vendaDoBruno).andExpect(status().isNotFound());
        venda(bruno, vendaDoBruno).andExpect(jsonPath("$.status").value("CONCLUIDA"));
    }

    @Test
    void adminCancelaDeOutro200() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");

        cancelar(empresa.admin(), venda, "Lançado errado")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cancelamento.canceladaPorNome").value("Admin Geral"));
    }

    @Test
    void estornoDinheiroAcimaDaGaveta409() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        lancar(empresa.admin(), sessao, "SANGRIA", "105.00").andExpect(status().isCreated());

        cancelar(empresa.operadora(), venda, "Erro")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Não há dinheiro suficiente na gaveta para devolver."));
        cancelar(empresa.admin(), venda, "Erro")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(
                        "Não há dinheiro suficiente na gaveta para devolver (R$ 5,00)."));
        assertThat(pdv.saldo(racao)).isEqualByComparingTo("4");
        venda(empresa.admin(), venda).andExpect(jsonPath("$.status").value("CONCLUIDA"));
    }

    @Test
    void cancelarDeNovoMesmoMotivo200() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        cancelar(empresa.operadora(), venda, "Desistiu").andExpect(status().isOk());

        cancelar(empresa.operadora(), venda, " Desistiu ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELADA"));
        assertThat(movimentos("ESTORNO")).hasSize(1);
        assertThat(pdv.saldo(racao)).isEqualByComparingTo("5");
    }

    @Test
    void outroMotivo409() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        cancelar(empresa.operadora(), venda, "Desistiu").andExpect(status().isOk());

        cancelar(empresa.operadora(), venda, "Outro")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Esta venda já foi cancelada."));
    }

    @Test
    void motivoVazio400() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");

        for (String motivo : java.util.Arrays.asList(null, "", "   ")) {
            cancelar(empresa.operadora(), venda, motivo)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.campos[0].campo").value("motivo"));
        }
        cancelar(empresa.operadora(), venda, "m".repeat(201))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("O motivo deve ter até 200 caracteres."));
        cancelar(empresa.operadora(), venda, "m".repeat(200)).andExpect(status().isOk());
    }

    @Test
    void vendaDeOutraEmpresa404() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        EmpresaDoPdv outra = pdv.novaEmpresa();

        cancelar(outra.admin(), venda, "Erro").andExpect(status().isNotFound());
        venda(outra.admin(), venda).andExpect(status().isNotFound());
    }

    private List<String> movimentos(String tipo) {
        return jdbcTemplate.query("""
                SELECT forma, valor FROM movimentos_caixa
                 WHERE sessao_caixa_id = (SELECT id FROM sessoes_caixa WHERE uuid = ?) AND tipo = ?
                """, (linha, numero) -> linha.getString("forma") + " "
                + linha.getBigDecimal("valor").setScale(2).toPlainString(), sessao, tipo);
    }
}
