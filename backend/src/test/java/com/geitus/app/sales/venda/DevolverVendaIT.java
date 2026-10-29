package com.geitus.app.sales.venda;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.sales.CenarioDoPdv.EmpresaDoPdv;
import com.geitus.app.sales.CenarioDoPdv.NovaEmbalagem;
import com.geitus.app.sales.CenarioDoPdv.NovoProduto;
import com.geitus.app.sales.IntegracaoDoPdv;

/**
 * {@code GET /api/pdv/devolucoes/venda} e {@code POST /api/pdv/vendas/{id}/devolucoes}
 * de ponta a ponta (docs/modules/estoque.md, secao 6.2): so o ADMIN, com o
 * proprio caixa aberto, de qualquer venda concluida; volta ao estoque (ou
 * avariado), reembolsa pela forma original e a venda deixa de poder ser
 * cancelada. A venda e da operadora (Caixa 1); o ADMIN devolve no Caixa 2.
 * Requer Docker.
 */
class DevolverVendaIT extends IntegracaoDoPdv {

    private EmpresaDoPdv empresa;
    private UUID caixaDoAdmin;
    private UUID racao;

    @BeforeEach
    void abrirOsCaixas() throws Exception {
        empresa = pdv.novaEmpresa();
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        caixaDoAdmin = abrirCaixa(empresa.admin(), cenario.novoPonto(empresa.caixa(), "Caixa 2"), "100.00");
        racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00").comEstoque("5")).id();
    }

    @Test
    void adminDevolveNoProprioCaixaVoltaAoEstoqueEReembolsaEmDinheiro() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "3"), pagamento("DINHEIRO", "30"), "30.00");

        devolver(empresa.admin(), venda, pedido(UUID.randomUUID(), "Cliente desistiu", linha(1, "2", "ESTOQUE"),
                reembolso("DINHEIRO", "20.00")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.vendaId").value(venda))
                .andExpect(jsonPath("$.valor").value(20.0))
                .andExpect(jsonPath("$.motivo").value("Cliente desistiu"))
                .andExpect(jsonPath("$.usuarioNome").value("Admin Geral"))
                .andExpect(jsonPath("$.criadaEm").value(startsWith("20")))
                .andExpect(jsonPath("$.itens[0].ordem").value(1))
                .andExpect(jsonPath("$.itens[0].nome").value("Ração"))
                .andExpect(jsonPath("$.itens[0].quantidade").value(2.0))
                .andExpect(jsonPath("$.itens[0].unidade").value("UN"))
                .andExpect(jsonPath("$.itens[0].destino").value("ESTOQUE"))
                .andExpect(jsonPath("$.reembolsos[0].forma").value("DINHEIRO"))
                .andExpect(jsonPath("$.reembolsos[0].valor").value(20.0));

        assertThat(pdv.saldo(racao)).isEqualByComparingTo("4");
        detalhe(empresa.admin(), caixaDoAdmin).andExpect(jsonPath("$.dinheiroNaGaveta").value(80.0));
        paraDevolucao(empresa.admin(), numero(venda))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linhas[0].quantidade").value(3.0))
                .andExpect(jsonPath("$.linhas[0].devolvida").value(2.0))
                .andExpect(jsonPath("$.linhas[0].disponivel").value(1.0))
                .andExpect(jsonPath("$.linhas[0].valorDisponivel").value(10.0))
                .andExpect(jsonPath("$.formas[0].forma").value("DINHEIRO"))
                .andExpect(jsonPath("$.formas[0].reembolsado").value(20.0))
                .andExpect(jsonPath("$.formas[0].disponivel").value(10.0))
                .andExpect(jsonPath("$.devolucoes.length()").value(1));
        venda(empresa.admin(), venda)
                .andExpect(jsonPath("$.situacaoDevolucao").value("PARCIAL"))
                .andExpect(jsonPath("$.devolucoes[0].valor").value(20.0))
                .andExpect(jsonPath("$.podeCancelar").value(false));
    }

    @Test
    void avariadoNaoMudaOSaldoEDevolverTudoDeixaAVendaTotal() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "2"), pagamento("PIX", "20.00"), "20.00");

        devolver(empresa.admin(), venda, pedido(UUID.randomUUID(), "Embalagem rasgada", linha(1, "2", "AVARIADO"),
                reembolso("PIX", "20.00")))
                .andExpect(status().isCreated());

        assertThat(pdv.saldo(racao)).isEqualByComparingTo("3");
        venda(empresa.admin(), venda).andExpect(jsonPath("$.situacaoDevolucao").value("TOTAL"));
        // PIX sem limite de gaveta: o esperado do PIX no caixa do admin fica negativo.
        detalhe(empresa.admin(), caixaDoAdmin).andExpect(jsonPath("$.dinheiroNaGaveta").value(100.0));
    }

    @Test
    void mesmaChaveDevolveAGravadaEComOutrosDadosDa409() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "3"), pagamento("DINHEIRO", "30"), "30.00");
        UUID chave = UUID.randomUUID();
        String pedido = pedido(chave, "Troca", linha(1, "1", "ESTOQUE"), reembolso("DINHEIRO", "10.00"));

        devolver(empresa.admin(), venda, pedido).andExpect(status().isCreated());
        devolver(empresa.admin(), venda, pedido).andExpect(status().isOk()).andExpect(jsonPath("$.valor").value(10.0));
        devolver(empresa.admin(), venda, pedido(chave, "Troca", linha(1, "2", "ESTOQUE"),
                reembolso("DINHEIRO", "20.00")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Esta operação já foi registrada com outros dados."));

        assertThat(pdv.saldo(racao)).isEqualByComparingTo("3");
    }

    @Test
    void operadorRecebe403EAdminSemCaixa409() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        String pedido = pedido(UUID.randomUUID(), "Troca", linha(1, "1", "ESTOQUE"), reembolso("DINHEIRO", "10.00"));

        devolver(empresa.operadora(), venda, pedido).andExpect(status().isForbidden());
        paraDevolucao(empresa.operadora(), numero(venda)).andExpect(status().isForbidden());

        Long gerente = cenario.novoUsuario(empresa.caixa(), "Gerente", "ADMIN");
        devolver(gerente, venda, pedido)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Abra o caixa para devolver."));
    }

    @Test
    void vendaCanceladaNaoEDevolvida() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        cancelar(empresa.operadora(), venda, "Desistiu").andExpect(status().isOk());

        paraDevolucao(empresa.admin(), numero(venda))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Esta venda foi cancelada e não pode ser devolvida."));
        devolver(empresa.admin(), venda, pedido(UUID.randomUUID(), "Troca", linha(1, "1", "ESTOQUE"),
                reembolso("DINHEIRO", "10.00")))
                .andExpect(status().isConflict());
    }

    @Test
    void vendaComDevolucaoNaoECancelada() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "2"), pagamento("DINHEIRO", "20"), "20.00");
        devolver(empresa.admin(), venda, pedido(UUID.randomUUID(), "Troca", linha(1, "1", "ESTOQUE"),
                reembolso("DINHEIRO", "10.00")))
                .andExpect(status().isCreated());

        cancelar(empresa.operadora(), venda, "Desistiu")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Esta venda tem devolução e não pode ser cancelada."));
    }

    @Test
    void vendaDeOutraEmpresaDa404() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "1"), pagamento("DINHEIRO", "10"), "10.00");
        EmpresaDoPdv outra = pdv.novaEmpresa();
        abrirCaixa(outra.admin(), outra.ponto(), "100.00");

        paraDevolucao(outra.admin(), numero(venda)).andExpect(status().isNotFound());
        devolver(outra.admin(), venda, pedido(UUID.randomUUID(), "Troca", linha(1, "1", "ESTOQUE"),
                reembolso("DINHEIRO", "10.00")))
                .andExpect(status().isNotFound());
    }

    @Test
    void quantidadeMotivoEReembolsoInvalidosDao400ComOCampo() throws Exception {
        String venda = vender(empresa.operadora(), item(racao, "3"), pagamento("DINHEIRO", "30"), "30.00");

        invalido(venda, pedido(UUID.randomUUID(), "Troca", linha(1, "4", "ESTOQUE"), reembolso("DINHEIRO", "40")),
                "itens[0].quantidade", "Só restam 3 UN para devolver nesta linha.");
        invalido(venda, pedido(UUID.randomUUID(), "Troca", linha(1, "0.5", "ESTOQUE"), reembolso("DINHEIRO", "5")),
                "itens[0].quantidade", CalculadoraDaDevolucao.MENSAGEM_UNIDADE_INTEIRA);
        invalido(venda, pedido(UUID.randomUUID(), "Troca", linha(9, "1", "ESTOQUE"), reembolso("DINHEIRO", "10")),
                "itens[0].ordem", DevolucoesService.MENSAGEM_LINHA_INEXISTENTE);
        invalido(venda, pedido(UUID.randomUUID(), "Troca", linha(1, "1", "ESTOQUE"), reembolso("DINHEIRO", "5.00")),
                "reembolsos", "Distribua R$ 10,00 entre as formas de pagamento.");
        invalido(venda, pedido(UUID.randomUUID(), "Troca", linha(1, "1", "ESTOQUE"), reembolso("PIX", "10.00")),
                "reembolsos[0].forma", "Esta venda não recebeu em PIX.");
        invalido(venda, pedido(UUID.randomUUID(), "Troca", linha(1, "1", "ESTOQUE"),
                reembolso("DINHEIRO", "5.00") + "," + reembolso("DINHEIRO", "5.00")),
                "reembolsos[1].forma", "Use uma linha por forma de pagamento.");
        invalido(venda, pedido(UUID.randomUUID(), "  ", linha(1, "1", "ESTOQUE"), reembolso("DINHEIRO", "10.00")),
                "motivo", "Informe o motivo.");

        assertThat(pdv.saldo(racao)).isEqualByComparingTo("2");
    }

    @Test
    void cadaFormaReembolsaAteORecebidoSemOTroco() throws Exception {
        // 3 UN = R$ 30,00, pagos com DINHEIRO 50 (troco 30) e PIX 10: recebido 20 em dinheiro e 10 no PIX.
        String corpo = finalizar(empresa.operadora(), vendaJson(item(racao, "3"),
                pagamento("DINHEIRO", "50") + "," + pagamento("PIX", "10"), "30.00", UUID.randomUUID()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String venda = com.jayway.jsonpath.JsonPath.read(corpo, "$.id");

        paraDevolucao(empresa.admin(), numero(venda))
                .andExpect(jsonPath("$.formas[0].forma").value("DINHEIRO"))
                .andExpect(jsonPath("$.formas[0].recebido").value(20.0))
                .andExpect(jsonPath("$.formas[1].forma").value("PIX"))
                .andExpect(jsonPath("$.formas[1].recebido").value(10.0));
        devolver(empresa.admin(), venda, pedido(UUID.randomUUID(), "Troca", linha(1, "1", "ESTOQUE"),
                reembolso("PIX", "10.00")))
                .andExpect(status().isCreated());

        invalido(venda, pedido(UUID.randomUUID(), "Troca", linha(1, "1", "ESTOQUE"), reembolso("PIX", "10.00")),
                "reembolsos[0].valor", "Em PIX restam R$ 0,00 para devolver.");
        // O troco nao conta: no dinheiro so ha R$ 20,00 a devolver, e nao os R$ 50,00 entregues.
        invalido(venda, pedido(UUID.randomUUID(), "Troca", linha(1, "2", "ESTOQUE"), reembolso("DINHEIRO", "21.00")),
                "reembolsos[0].valor", "Em dinheiro restam R$ 20,00 para devolver.");
    }

    @Test
    void embalagemSoInteiraEEtiquetaSoInteira() throws Exception {
        ProdutoResponse nexgard = pdv.produto(empresa, NovoProduto.de("Nexgard", "UN", "89.90").comEstoque("10")
                .comEmbalagens(new NovaEmbalagem("CX", "3", "209.90", List.of())));
        UUID queijo = pdv.produto(empresa, NovoProduto.de("Queijo", "KG", "25.00").naBalanca(542)).id();
        String itens = "{\"produtoId\":\"" + nexgard.id() + "\",\"embalagemId\":\"" + nexgard.embalagens().get(0).id()
                + "\",\"quantidade\":2},{\"produtoId\":\"" + queijo + "\",\"codigoLido\":\"2000542010000\","
                + "\"etiqueta\":true}";
        String corpo = finalizar(empresa.operadora(), vendaJson(itens, pagamento("PIX", "429.80"), "429.80",
                UUID.randomUUID())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String venda = com.jayway.jsonpath.JsonPath.read(corpo, "$.id");

        invalido(venda, pedido(UUID.randomUUID(), "Troca", linha(1, "1.5", "ESTOQUE"), reembolso("PIX", "1")),
                "itens[0].quantidade", CalculadoraDaDevolucao.MENSAGEM_EMBALAGENS_INTEIRAS);
        devolver(empresa.admin(), venda, pedido(UUID.randomUUID(), "Troca", linha(2, "0.001", "ESTOQUE"),
                reembolso("PIX", "1")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value(startsWith("Item de balança só volta inteiro")));
        // Uma caixa de 3 UN volta 3 UN ao estoque, com o valor proporcional (R$ 209,90).
        devolver(empresa.admin(), venda, pedido(UUID.randomUUID(), "Troca", linha(1, "1", "ESTOQUE"),
                reembolso("PIX", "209.90")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.itens[0].unidade").value("CX c/ 3 UN"));
        assertThat(pdv.saldo(nexgard.id())).isEqualByComparingTo("7");
    }

    @Test
    void dinheiroAlemDaGavetaDa409ComOValor() throws Exception {
        cenario.fecharPorJdbc(caixaDoAdmin, empresa.admin());
        abrirCaixa(empresa.admin(), cenario.novoPonto(empresa.caixa(), "Caixa 3"), "5.00");
        String venda = vender(empresa.operadora(), item(racao, "2"), pagamento("DINHEIRO", "20"), "20.00");

        devolver(empresa.admin(), venda, pedido(UUID.randomUUID(), "Troca", linha(1, "2", "ESTOQUE"),
                reembolso("DINHEIRO", "20.00")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Não há dinheiro suficiente na gaveta para devolver (R$ 5,00)."));
        assertThat(pdv.saldo(racao)).isEqualByComparingTo("3");
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private ResultActions devolver(Long usuario, String venda, String corpo) throws Exception {
        return mockMvc.perform(post("/api/pdv/vendas/" + venda + "/devolucoes")
                .header("Authorization", cenario.token(usuario))
                .contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private ResultActions paraDevolucao(Long usuario, long numero) throws Exception {
        return mockMvc.perform(get("/api/pdv/devolucoes/venda").param("numero", String.valueOf(numero))
                .header("Authorization", cenario.token(usuario)));
    }

    private void invalido(String venda, String corpo, String campo, String mensagem) throws Exception {
        devolver(empresa.admin(), venda, corpo)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value(campo))
                .andExpect(jsonPath("$.mensagem").value(mensagem));
    }

    private long numero(String venda) {
        return jdbcTemplate.queryForObject("SELECT numero FROM vendas WHERE uuid = ?::uuid", Long.class, venda);
    }

    private static String pedido(UUID chave, String motivo, String itens, String reembolsos) {
        return "{\"chave\":\"" + chave + "\",\"motivo\":\"" + motivo + "\",\"itens\":[" + itens
                + "],\"reembolsos\":[" + reembolsos + "]}";
    }

    private static String linha(int ordem, String quantidade, String destino) {
        return "{\"ordem\":" + ordem + ",\"quantidade\":" + quantidade + ",\"destino\":\"" + destino + "\"}";
    }

    private static String reembolso(String forma, String valor) {
        return "{\"forma\":\"" + forma + "\",\"valor\":" + valor + "}";
    }
}
