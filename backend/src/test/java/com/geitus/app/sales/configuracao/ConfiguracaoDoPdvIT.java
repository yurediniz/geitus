package com.geitus.app.sales.configuracao;

import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.geitus.app.sales.CenarioDoPdv.EmpresaDoPdv;
import com.geitus.app.sales.IntegracaoDoPdv;

/**
 * Configuracoes › PDV (docs/modules/pdv.md): padroes, alteracao pelo
 * ADMIN com quem e quando, OPERADOR e ADMIN rebaixado recusados e os limites
 * do percentual.
 */
class ConfiguracaoDoPdvIT extends IntegracaoDoPdv {

    private EmpresaDoPdv empresa;

    @BeforeEach
    void criarEmpresa() {
        empresa = pdv.novaEmpresa();
    }

    @Test
    void padraoSemConfiguracaoGravada() throws Exception {
        ler(empresa.operadora())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.venderSemEstoque").value(true))
                .andExpect(jsonPath("$.descontoMaximoOperador").value(10.0))
                .andExpect(jsonPath("$.atualizadoPorNome").value(nullValue()))
                .andExpect(jsonPath("$.atualizadoEm").value(nullValue()));
    }

    @Test
    void adminAltera() throws Exception {
        salvar(cenario.token(empresa.admin()), "{\"venderSemEstoque\":false,\"descontoMaximoOperador\":12.5}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.venderSemEstoque").value(false))
                .andExpect(jsonPath("$.descontoMaximoOperador").value(12.5))
                .andExpect(jsonPath("$.atualizadoPorNome").value("Admin Geral"))
                .andExpect(jsonPath("$.atualizadoEm").value(endsWith("-03:00")));

        ler(empresa.operadora())
                .andExpect(jsonPath("$.venderSemEstoque").value(false))
                .andExpect(jsonPath("$.descontoMaximoOperador").value(12.5))
                .andExpect(jsonPath("$.atualizadoPorNome").value("Admin Geral"));
        salvar(cenario.token(empresa.admin()), "{\"venderSemEstoque\":true,\"descontoMaximoOperador\":100}")
                .andExpect(status().isOk());
        salvar(cenario.token(empresa.admin()), "{\"venderSemEstoque\":true,\"descontoMaximoOperador\":0}")
                .andExpect(status().isOk());
    }

    @Test
    void operador403() throws Exception {
        salvar(cenario.token(empresa.operadora()), "{\"venderSemEstoque\":false,\"descontoMaximoOperador\":50}")
                .andExpect(status().isForbidden());
        ler(empresa.operadora()).andExpect(jsonPath("$.venderSemEstoque").value(true));
    }

    @Test
    void adminRebaixadoComTokenAntigo403() throws Exception {
        String tokenDeAdmin = cenario.token(empresa.admin());
        cenario.rebaixarParaOperador(empresa.admin());

        salvar(tokenDeAdmin, "{\"venderSemEstoque\":false,\"descontoMaximoOperador\":50}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.mensagem").value("Acesso negado."));
        ler(empresa.operadora()).andExpect(jsonPath("$.descontoMaximoOperador").value(10.0));
    }

    @Test
    void percentualForaDoIntervalo400() throws Exception {
        String token = cenario.token(empresa.admin());
        salvar(token, "{\"venderSemEstoque\":true,\"descontoMaximoOperador\":101}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("descontoMaximoOperador"));
        salvar(token, "{\"venderSemEstoque\":true,\"descontoMaximoOperador\":-1}").andExpect(status().isBadRequest());
        salvar(token, "{\"venderSemEstoque\":true,\"descontoMaximoOperador\":10.555}")
                .andExpect(status().isBadRequest());
        salvar(token, "{\"venderSemEstoque\":null,\"descontoMaximoOperador\":10}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("venderSemEstoque"));
    }

    private ResultActions ler(Long usuario) throws Exception {
        return mockMvc.perform(get("/api/configuracoes/pdv").header("Authorization", cenario.token(usuario)));
    }

    private ResultActions salvar(String token, String corpo) throws Exception {
        return mockMvc.perform(put("/api/configuracoes/pdv").header("Authorization", token)
                .contentType(MediaType.APPLICATION_JSON).content(corpo));
    }
}
