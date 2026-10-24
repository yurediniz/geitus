package com.geitus.app.sales.venda;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.geitus.app.sales.CenarioDoPdv.EmpresaDoPdv;
import com.geitus.app.sales.CenarioDoPdv.NovoProduto;
import com.geitus.app.sales.IntegracaoDoPdv;

/**
 * {@code GET /api/pdv/vendas} e {@code GET /api/pdv/vendas/{id}}
 * (docs/modules/pdv.md, 5.3): o OPERADOR so ve as vendas das proprias
 * sessoes; sem sessao e sem periodo vale a sessao atual; filtros de situacao,
 * periodo e numero; {@code podeCancelar} coerente; outra empresa, 404.
 */
class ConsultaDeVendasIT extends IntegracaoDoPdv {

    private EmpresaDoPdv empresa;
    private UUID racao;
    private Long bruno;
    private String hoje;

    @BeforeEach
    void criarEmpresa() {
        empresa = pdv.novaEmpresa();
        racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();
        bruno = cenario.novoUsuario(empresa.caixa(), "Bruno Lima", "OPERADOR");
        hoje = pdv.hoje().toString();
    }

    @Test
    void operadorSoDasPropriasSessoes() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
        abrirCaixa(bruno, cenario.novoPonto(empresa.caixa(), "Caixa 2"), "0.00");
        String daAna = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        String doBruno = vender(bruno, item(racao, "2"), pagamento("PIX", "20"), "20.00");

        vendas(empresa.operadora(), "?de=" + hoje)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens[*].id", contains(daAna)))
                .andExpect(jsonPath("$.totalItens").value(1));
        vendas(empresa.admin(), "?de=" + hoje + "&ate=" + hoje)
                .andExpect(jsonPath("$.itens[*].id", contains(doBruno, daAna)));
        venda(empresa.operadora(), doBruno).andExpect(status().isNotFound());
        venda(empresa.admin(), doBruno).andExpect(status().isOk())
                .andExpect(jsonPath("$.itens", hasSize(1)));
    }

    @Test
    void padraoASessaoAtual() throws Exception {
        UUID primeira = abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
        vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        contar(empresa.operadora(), primeira, "10.00", null).andExpect(jsonPath("$.status").value("FECHADA"));
        UUID segunda = abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
        String atual = vender(empresa.operadora(), item(racao, "3"), pagamento("DINHEIRO", "30"), "30.00");

        vendas(empresa.operadora(), "")
                .andExpect(jsonPath("$.itens[*].id", contains(atual)))
                .andExpect(jsonPath("$.itens[0].sessaoId").value(segunda.toString()))
                .andExpect(jsonPath("$.itens[0].itens").doesNotExist())
                .andExpect(jsonPath("$.itens[0].pagamentos[0].forma").value("DINHEIRO"))
                .andExpect(jsonPath("$.itens[0].pagamentos[0].valor").value(30.0));
        vendas(empresa.operadora(), "?sessaoId=" + primeira).andExpect(jsonPath("$.itens", hasSize(1)));
        vendas(empresa.admin(), "").andExpect(jsonPath("$.itens", hasSize(0)));
        vendas(empresa.admin(), "?sessaoId=" + segunda).andExpect(jsonPath("$.itens[*].id", contains(atual)));
    }

    @Test
    void filtrosStatusPeriodoENumero() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        String primeira = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        String segunda = vender(empresa.operadora(), item(racao, "2"), pagamento("DINHEIRO", "20"), "20.00");
        cancelar(empresa.operadora(), primeira, "Desistiu").andExpect(status().isOk());

        vendas(empresa.operadora(), "?status=CANCELADA").andExpect(jsonPath("$.itens[*].id", contains(primeira)));
        vendas(empresa.operadora(), "?status=CONCLUIDA").andExpect(jsonPath("$.itens[*].id", contains(segunda)));
        vendas(empresa.operadora(), "?numero=2").andExpect(jsonPath("$.itens[*].id", contains(segunda)));
        vendas(empresa.operadora(), "?de=" + hoje + "&ate=" + hoje).andExpect(jsonPath("$.itens", hasSize(2)));
        String amanha = LocalDate.parse(hoje).plusDays(1).toString();
        vendas(empresa.operadora(), "?de=" + amanha).andExpect(jsonPath("$.itens", hasSize(0)));
        vendas(empresa.operadora(), "?ate=" + LocalDate.parse(hoje).minusDays(1))
                .andExpect(jsonPath("$.itens", hasSize(0)));
        vendas(empresa.operadora(), "?de=" + amanha + "&ate=" + hoje)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("de"));
        vendas(empresa.operadora(), "?tamanho=0").andExpect(status().isBadRequest());
    }

    @Test
    void podeCancelarCoerente() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");

        vendas(empresa.operadora(), "").andExpect(jsonPath("$.itens[0].podeCancelar").value(true));
        vendas(empresa.admin(), "?sessaoId=" + sessao).andExpect(jsonPath("$.itens[0].podeCancelar").value(true));

        contar(empresa.operadora(), sessao, "10.00", null).andExpect(jsonPath("$.status").value("FECHADA"));

        venda(empresa.operadora(), venda).andExpect(jsonPath("$.podeCancelar").value(false));
        venda(empresa.admin(), venda).andExpect(jsonPath("$.podeCancelar").value(false));
    }

    @Test
    void vendaDeOutraEmpresa404() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        EmpresaDoPdv outra = pdv.novaEmpresa();

        venda(outra.admin(), venda)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Venda não encontrada."));
        vendas(outra.admin(), "?de=" + hoje).andExpect(jsonPath("$.itens", hasSize(0)));
        vendas(outra.admin(), "?sessaoId=" + UUID.randomUUID()).andExpect(jsonPath("$.itens", hasSize(0)));
    }
}
