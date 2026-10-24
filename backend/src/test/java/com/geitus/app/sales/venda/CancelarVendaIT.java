package com.geitus.app.sales.venda;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.endsWith;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
