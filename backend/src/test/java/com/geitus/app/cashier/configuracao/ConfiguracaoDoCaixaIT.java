package com.geitus.app.cashier.configuracao;

import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.geitus.app.cashier.CenarioDeCaixa;
import com.geitus.app.cashier.CenarioDeCaixa.EmpresaDeCaixa;
import com.geitus.app.cashier.IntegracaoDoCaixa;

/**
 * Configuracao do caixa (docs/modules/caixa.md): fechamento cego ligado
 * por padrao, so o ADMIN altera, a alteracao registra quem e quando, e todos
 * os autenticados leem.
 */
class ConfiguracaoDoCaixaIT extends IntegracaoDoCaixa {

    private static final String HORARIO_DE_SAO_PAULO = ".*-03:00$";

    @Test
    void padraoECegoLigado() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();

        ler(empresa.admin())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fechamentoCego").value(true))
                .andExpect(jsonPath("$.atualizadoPorNome").value(nullValue()))
                .andExpect(jsonPath("$.atualizadoEm").value(nullValue()));
    }

    @Test
    void adminAlteraEGravaQuemEQuando() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();

        salvar(empresa.admin(), "{\"fechamentoCego\":false}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fechamentoCego").value(false))
                .andExpect(jsonPath("$.atualizadoPorNome").value(CenarioDeCaixa.NOME_DO_ADMIN))
                .andExpect(jsonPath("$.atualizadoEm").value(matchesPattern(HORARIO_DE_SAO_PAULO)));
        ler(empresa.operadora())
                .andExpect(jsonPath("$.fechamentoCego").value(false))
                .andExpect(jsonPath("$.atualizadoPorNome").value(CenarioDeCaixa.NOME_DO_ADMIN))
                .andExpect(jsonPath("$.atualizadoEm").value(matchesPattern(HORARIO_DE_SAO_PAULO)));

        Long outroAdmin = cenario.novoUsuario(empresa, "Bruno Lima", "ADMIN");
        salvar(outroAdmin, "{\"fechamentoCego\":true}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fechamentoCego").value(true))
                .andExpect(jsonPath("$.atualizadoPorNome").value("Bruno Lima"));
    }

    @Test
    void operadorLe200EAltera403() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();

        ler(empresa.operadora()).andExpect(status().isOk());
        salvar(empresa.operadora(), "{\"fechamentoCego\":false}").andExpect(status().isForbidden());
        ler(empresa.admin()).andExpect(jsonPath("$.fechamentoCego").value(true));
    }

    /** O perfil da escrita e o do banco: o token antigo de quem foi rebaixado nao basta. */
    @Test
    void adminRebaixadoComTokenAntigo403() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();
        String tokenDeAdmin = cenario.token(empresa.admin());
        cenario.rebaixarParaOperador(empresa.admin());

        mockMvc.perform(put("/api/configuracoes/caixa").header("Authorization", tokenDeAdmin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"fechamentoCego\":false}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.mensagem").value("Acesso negado."));
        ler(empresa.operadora()).andExpect(jsonPath("$.fechamentoCego").value(true));
    }

    /** Metodos sem rota na configuracao exigem ADMIN (matcher sem metodo). */
    @Test
    void outrosMetodosNaConfiguracaoExigemAdmin() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();

        mockMvc.perform(post("/api/configuracoes/caixa").header("Authorization", cenario.token(empresa.operadora()))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void corpoSemCampo400() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();

        salvar(empresa.admin(), "{}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("fechamentoCego"));
    }

    @Test
    void configuracaoDeUmaEmpresaNaoAfetaOutra() throws Exception {
        EmpresaDeCaixa empresaA = cenario.novaEmpresa();
        EmpresaDeCaixa empresaB = cenario.novaEmpresa();

        salvar(empresaA.admin(), "{\"fechamentoCego\":false}").andExpect(status().isOk());

        ler(empresaB.admin()).andExpect(jsonPath("$.fechamentoCego").value(true));
    }

    private ResultActions ler(Long usuario) throws Exception {
        return mockMvc.perform(get("/api/configuracoes/caixa").header("Authorization", cenario.token(usuario)));
    }

    private ResultActions salvar(Long usuario, String corpo) throws Exception {
        return mockMvc.perform(put("/api/configuracoes/caixa").header("Authorization", cenario.token(usuario))
                .contentType(MediaType.APPLICATION_JSON).content(corpo));
    }
}
