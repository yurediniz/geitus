package com.geitus.app.sales.venda;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.geitus.app.sales.CenarioDoPdv.EmpresaDoPdv;
import com.geitus.app.sales.CenarioDoPdv.NovoProduto;
import com.geitus.app.sales.IntegracaoDoPdv;

/**
 * Tela de Vendas ({@code GET /api/pdv/vendas}, docs/modules/pdv.md): filtros
 * por ponto e por vendedor so para o ADMIN (ignorados para o OPERADOR), o
 * numero em qualquer data, o limite de 1 ano no periodo e a situacao de
 * devolucao na lista.
 */
class ListaDeVendasIT extends IntegracaoDoPdv {

    private EmpresaDoPdv empresa;
    private UUID racao;
    private Long bruno;
    private UUID caixa2;

    @BeforeEach
    void criarEmpresa() {
        empresa = pdv.novaEmpresa();
        racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00").comEstoque("50")).id();
        bruno = cenario.novoUsuario(empresa.caixa(), "Bruno Lima", "OPERADOR");
        caixa2 = cenario.novoPonto(empresa.caixa(), "Caixa 2");
    }

    @Test
    void pontoEVendedorSoParaOAdmin() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
        abrirCaixa(bruno, caixa2, "0.00");
        String daAna = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        String doBruno = vender(bruno, item(racao, "2"), pagamento("PIX", "20"), "20.00");
        String periodo = "?de=" + dataDaVenda(daAna) + "&ate=" + dataDaVenda(doBruno);

        vendas(empresa.admin(), periodo + "&pontoId=" + caixa2).andExpect(jsonPath("$.itens[*].id", contains(doBruno)));
        vendas(empresa.admin(), periodo + "&pontoId=" + empresa.ponto())
                .andExpect(jsonPath("$.itens[*].id", contains(daAna)))
                .andExpect(jsonPath("$.totalItens").value(1));
        vendas(empresa.admin(), periodo + "&vendedorId=" + bruno).andExpect(jsonPath("$.itens[*].id", contains(doBruno)));
        vendas(empresa.admin(), periodo + "&vendedorId=" + bruno + "&pontoId=" + empresa.ponto())
                .andExpect(jsonPath("$.itens", hasSize(0)));

        // O OPERADOR ve so as proprias vendas: o ponto e o vendedor pedidos sao ignorados.
        vendas(empresa.operadora(), periodo + "&vendedorId=" + bruno)
                .andExpect(jsonPath("$.itens[*].id", contains(daAna)));
        vendas(empresa.operadora(), periodo + "&pontoId=" + caixa2)
                .andExpect(jsonPath("$.itens[*].id", contains(daAna)));
    }

    @Test
    void pontoOuVendedorDeOutraEmpresaDaListaVazia() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        EmpresaDoPdv outra = pdv.novaEmpresa();
        String periodo = "?de=" + dataDaVenda(venda);

        vendas(empresa.admin(), periodo + "&pontoId=" + outra.ponto())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens", hasSize(0)));
        vendas(empresa.admin(), periodo + "&pontoId=" + UUID.randomUUID()).andExpect(jsonPath("$.itens", hasSize(0)));
        vendas(empresa.admin(), periodo + "&vendedorId=" + outra.operadora())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens", hasSize(0)));
    }

    @Test
    void numeroSemSessaoValeEmQualquerData() throws Exception {
        UUID primeira = abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
        String antiga = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        contar(empresa.operadora(), primeira, "10.00", null).andExpect(jsonPath("$.status").value("FECHADA"));
        abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
        abrirCaixa(bruno, caixa2, "0.00");
        String doBruno = vender(bruno, item(racao, "2"), pagamento("PIX", "20"), "20.00");
        String amanha = LocalDate.parse(dataDaVenda(antiga)).plusDays(1).toString();

        // A venda nº 1 e de um caixa ja fechado e fica fora do periodo: o numero a acha mesmo assim.
        vendas(empresa.operadora(), "?numero=1").andExpect(jsonPath("$.itens[*].id", contains(antiga)));
        vendas(empresa.admin(), "?numero=1&de=" + amanha).andExpect(jsonPath("$.itens[*].id", contains(antiga)));
        // O OPERADOR so acha o numero se a venda for dele.
        vendas(empresa.operadora(), "?numero=2").andExpect(jsonPath("$.itens", hasSize(0)));
        vendas(empresa.admin(), "?numero=2").andExpect(jsonPath("$.itens[*].id", contains(doBruno)));
        // Com a sessao (o F8), o numero continua preso a ela.
        vendas(empresa.operadora(), "?sessaoId=" + primeira + "&numero=1")
                .andExpect(jsonPath("$.itens[*].id", contains(antiga)));
        vendas(empresa.admin(), "?sessaoId=" + primeira + "&numero=2").andExpect(jsonPath("$.itens", hasSize(0)));
    }

    @Test
    void numeroSemSessaoNaoAchaVendaDeOutraEmpresa() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "0.00");
        String daEmpresa = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        EmpresaDoPdv outra = pdv.novaEmpresa();
        UUID racaoDaOutra = pdv.produto(outra, NovoProduto.de("Ração", "UN", "10.00").comEstoque("50")).id();
        abrirCaixa(outra.operadora(), outra.ponto(), "0.00");
        String daOutra = vender(outra.operadora(), item(racaoDaOutra, "1"), pagamento("DINHEIRO", "10"), "10.00");

        // As duas empresas tem a venda nº 1: a busca em qualquer data fica na empresa de quem pede.
        vendas(empresa.admin(), "?numero=1").andExpect(jsonPath("$.itens[*].id", contains(daEmpresa)));
        vendas(outra.admin(), "?numero=1").andExpect(jsonPath("$.itens[*].id", contains(daOutra)));
    }

    @Test
    void periodoDeNoMaximoUmAno() throws Exception {
        vendas(empresa.admin(), "?de=2025-01-01&ate=2026-01-01").andExpect(status().isOk());
        vendas(empresa.admin(), "?de=2025-01-01&ate=2026-01-02")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("de"))
                .andExpect(jsonPath("$.campos[0].mensagem").value("O período pode ter no máximo 1 ano."));
    }

    @Test
    void situacaoDeDevolucaoNaLista() throws Exception {
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        abrirCaixa(empresa.admin(), caixa2, "100.00");
        String semDevolucao = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        String parcial = vender(empresa.operadora(), item(racao, "3"), pagamento("DINHEIRO", "30"), "30.00");
        String total = vender(empresa.operadora(), item(racao, "2"), pagamento("DINHEIRO", "20"), "20.00");
        devolver(empresa.admin(), parcial, linha(1, "1"), "10.00").andExpect(status().isCreated());
        devolver(empresa.admin(), total, linha(1, "2"), "20.00").andExpect(status().isCreated());

        vendas(empresa.admin(), "?de=" + dataDaVenda(semDevolucao))
                .andExpect(jsonPath("$.itens[*].id", containsInAnyOrder(semDevolucao, parcial, total)))
                .andExpect(jsonPath("$.itens[?(@.id == '" + semDevolucao + "')].situacaoDevolucao").value("NENHUMA"))
                .andExpect(jsonPath("$.itens[?(@.id == '" + parcial + "')].situacaoDevolucao").value("PARCIAL"))
                .andExpect(jsonPath("$.itens[?(@.id == '" + total + "')].situacaoDevolucao").value("TOTAL"))
                .andExpect(jsonPath("$.itens[0].devolucoes").doesNotExist());
    }

    private ResultActions devolver(Long usuario, String venda, String linha, String valor) throws Exception {
        String corpo = "{\"chave\":\"" + UUID.randomUUID() + "\",\"motivo\":\"Troca\",\"itens\":[" + linha
                + "],\"reembolsos\":[{\"forma\":\"DINHEIRO\",\"valor\":" + valor + "}]}";
        return mockMvc.perform(post("/api/pdv/vendas/" + venda + "/devolucoes")
                .header("Authorization", cenario.token(usuario))
                .contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private static String linha(int ordem, String quantidade) {
        return "{\"ordem\":" + ordem + ",\"quantidade\":" + quantidade + ",\"destino\":\"ESTOQUE\"}";
    }

    /** A data (em America/Sao_Paulo) em que a venda foi concluida, lida da propria venda. */
    private String dataDaVenda(String venda) throws Exception {
        String concluidaEm = com.jayway.jsonpath.JsonPath.read(venda(empresa.admin(), venda)
                .andReturn().getResponse().getContentAsString(), "$.concluidaEm");
        return concluidaEm.substring(0, 10);
    }
}
