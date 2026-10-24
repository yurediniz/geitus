package com.geitus.app.sales;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.geitus.app.cashier.IntegracaoDoCaixa;
import com.geitus.app.sales.CenarioDoPdv.EmpresaDoPdv;

/**
 * Base dos testes de integracao do PDV: a mesma do caixa (container unico,
 * contexto reaproveitado entre as classes do PDV, MockMvc e sem
 * {@code @Transactional}), com o {@link CenarioDoPdv} e os atalhos das rotas
 * do PDV, chamadas como a tela, com o token do usuario. Requer Docker.
 */
@Import(CenarioDoPdv.class)
public abstract class IntegracaoDoPdv extends IntegracaoDoCaixa {

    @Autowired
    protected CenarioDoPdv pdv;

    protected ResultActions resolver(Long usuario, String codigo) throws Exception {
        return mockMvc.perform(get("/api/pdv/itens").param("codigo", codigo)
                .header("Authorization", cenario.token(usuario)));
    }

    protected ResultActions buscar(Long usuario, String texto) throws Exception {
        return mockMvc.perform(get("/api/pdv/itens").param("busca", texto)
                .header("Authorization", cenario.token(usuario)));
    }

    protected ResultActions calcular(Long usuario, String carrinhoJson) throws Exception {
        return enviarJson(usuario, post("/api/pdv/calculo"), carrinhoJson);
    }

    protected ResultActions finalizar(Long usuario, String vendaJson) throws Exception {
        return enviarJson(usuario, post("/api/pdv/vendas"), vendaJson);
    }

    protected ResultActions cancelar(Long usuario, String venda, String motivo) throws Exception {
        String motivoJson = motivo == null ? "null" : "\"" + motivo + "\"";
        return enviarJson(usuario, post("/api/pdv/vendas/" + venda + "/cancelamento"),
                "{\"motivo\":" + motivoJson + "}");
    }

    protected ResultActions venda(Long usuario, String venda) throws Exception {
        return mockMvc.perform(get("/api/pdv/vendas/" + venda).header("Authorization", cenario.token(usuario)));
    }

    protected ResultActions vendas(Long usuario, String consulta) throws Exception {
        return mockMvc.perform(get("/api/pdv/vendas" + consulta).header("Authorization", cenario.token(usuario)));
    }

    /** Liga ou desliga "Vender sem estoque" e define o desconto maximo do operador (ADMIN, pela API). */
    protected void configurarPdv(EmpresaDoPdv empresa, boolean venderSemEstoque, String descontoMaximo)
            throws Exception {
        enviarJson(empresa.admin(), put("/api/configuracoes/pdv"), "{\"venderSemEstoque\":" + venderSemEstoque
                + ",\"descontoMaximoOperador\":" + descontoMaximo + "}").andExpect(status().isOk());
    }

    private ResultActions enviarJson(Long usuario,
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder pedido, String corpo)
            throws Exception {
        return mockMvc.perform(pedido.header("Authorization", cenario.token(usuario))
                .contentType(MediaType.APPLICATION_JSON).content(corpo));
    }
}
