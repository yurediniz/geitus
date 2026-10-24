package com.geitus.app.cashier.sessao;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.geitus.app.cashier.CenarioDeCaixa.EmpresaDeCaixa;
import com.geitus.app.cashier.IntegracaoDoCaixa;

/**
 * Modo cego (docs/modules/caixa.md, 3.6 e 7): com o fechamento cego ligado (o
 * padrao) e a sessao ABERTA, nenhuma resposta ao OPERADOR traz o esperado da
 * gaveta, nem a mensagem da sangria. O ADMIN sempre ve; depois da contagem,
 * todos veem.
 *
 * <p>Cenario: Ana (OPERADORA) abre com R$ 100,00 e lanca um suprimento de
 * R$ 57,00: o esperado e R$ 157,00, valor que nao aparece em nenhum outro
 * lugar das respostas.
 */
class ModoCegoIT extends IntegracaoDoCaixa {

    /**
     * O esperado como sairia no JSON (157.00) ou numa mensagem (R$ 157,00).
     * UUIDs e horarios nunca tem "157." nem "157,".
     */
    private static final String ESPERADO_NO_JSON = "157.";
    private static final String ESPERADO_NA_MENSAGEM = "157,";

    private EmpresaDeCaixa empresa;
    private UUID caixa1;
    private UUID sessao;

    @BeforeEach
    void anaAbreELancaNoModoCego() throws Exception {
        empresa = cenario.novaEmpresa();
        caixa1 = cenario.novoPonto(empresa, "Caixa 1");
        sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        lancar(empresa.operadora(), sessao, "SUPRIMENTO", "57.00").andExpect(status().isCreated())
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(nullValue()))
                .andExpect(jsonPath("$.fechamentoCego").value(true));
    }

    @Test
    void operadorNaoRecebeDinheiroNaGavetaEmAberta() throws Exception {
        atual(empresa.operadora()).andExpect(status().isOk())
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(nullValue()))
                .andExpect(jsonPath("$.valorEsperado").value(nullValue()))
                .andExpect(content().string(not(containsString(ESPERADO_NO_JSON))))
                .andExpect(content().string(not(containsString(ESPERADO_NA_MENSAGEM))));
        detalhe(empresa.operadora(), sessao).andExpect(status().isOk())
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(nullValue()))
                .andExpect(content().string(not(containsString(ESPERADO_NO_JSON))))
                .andExpect(content().string(not(containsString(ESPERADO_NA_MENSAGEM))));
        historico(empresa.operadora(), "").andExpect(status().isOk())
                .andExpect(jsonPath("$.itens[0].dinheiroNaGaveta").value(nullValue()))
                .andExpect(content().string(not(containsString(ESPERADO_NO_JSON))))
                .andExpect(content().string(not(containsString(ESPERADO_NA_MENSAGEM))));
        pontos(empresa.operadora()).andExpect(status().isOk())
                .andExpect(content().string(not(containsString("dinheiroNaGaveta"))))
                .andExpect(content().string(not(containsString(ESPERADO_NO_JSON))))
                .andExpect(content().string(not(containsString(ESPERADO_NA_MENSAGEM))));
    }

    /**
     * Spec 3.6: no modo cego a operadora so ve os valores que ela mesma
     * lancou. A sangria de R$ 157,00 do ADMIN aparece na lista (tipo, motivo,
     * quem e quando) sem o valor, ate a contagem.
     */
    @Test
    void lancamentoDeOutraPessoaSemValorParaOperadorAteAContagem() throws Exception {
        lancar(empresa.admin(), sessao, "SANGRIA", "157.00", "Depósito no cofre", UUID.randomUUID())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.movimentos[0].valor").value(157.0));

        atual(empresa.operadora())
                .andExpect(jsonPath("$.movimentos[0].tipo").value("SANGRIA"))
                .andExpect(jsonPath("$.movimentos[0].motivo").value("Depósito no cofre"))
                .andExpect(jsonPath("$.movimentos[0].usuarioNome").value("Admin Geral"))
                .andExpect(jsonPath("$.movimentos[0].criadoEm").isNotEmpty())
                .andExpect(jsonPath("$.movimentos[0].valor").value(nullValue()))
                .andExpect(jsonPath("$.movimentos[1].valor").value(57.0))
                .andExpect(jsonPath("$.movimentos[2].valor").value(100.0))
                .andExpect(content().string(not(containsString(ESPERADO_NO_JSON))));
        detalhe(empresa.operadora(), sessao)
                .andExpect(content().string(not(containsString(ESPERADO_NO_JSON))));
        lancar(empresa.operadora(), sessao, "SUPRIMENTO", "1.00")
                .andExpect(content().string(not(containsString(ESPERADO_NO_JSON))));
        historico(empresa.operadora(), "")
                .andExpect(content().string(not(containsString(ESPERADO_NO_JSON))));

        contar(empresa.operadora(), sessao, "1.00", null)
                .andExpect(jsonPath("$.status").value("FECHADA"))
                .andExpect(jsonPath("$.movimentos[1].valor").value(157.0));
        detalhe(empresa.operadora(), sessao).andExpect(jsonPath("$.movimentos[1].valor").value(157.0));
    }

    @Test
    void adminRecebe() throws Exception {
        detalhe(empresa.admin(), sessao).andExpect(jsonPath("$.dinheiroNaGaveta").value(157.0))
                .andExpect(jsonPath("$.fechamentoCego").value(true));
        historico(empresa.admin(), "").andExpect(jsonPath("$.itens[0].dinheiroNaGaveta").value(157.0));

        UUID doAdmin = abrirCaixa(empresa.admin(), cenario.novoPonto(empresa, "Caixa 2"), "20.00");
        atual(empresa.admin()).andExpect(jsonPath("$.id").value(doAdmin.toString()))
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(20.0));
    }

    @Test
    void depoisDaContagemTodosRecebem() throws Exception {
        contar(empresa.operadora(), sessao, "150.00", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("EM_CONFERENCIA"))
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(157.0))
                .andExpect(jsonPath("$.valorEsperado").value(157.0))
                .andExpect(jsonPath("$.valorContado").value(150.0))
                .andExpect(jsonPath("$.diferenca").value(-7.0));

        atual(empresa.operadora()).andExpect(jsonPath("$.valorEsperado").value(157.0));
        historico(empresa.operadora(), "").andExpect(jsonPath("$.itens[0].dinheiroNaGaveta").value(157.0));
    }

    /** Com ou sem diferenca: aceitar a justificativa so quando ha diferenca revelaria o esperado. */
    @Test
    void justificativaJuntoComContagemNoCego400() throws Exception {
        contar(empresa.operadora(), sessao, "150.00", "Faltou")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Informe a justificativa depois de ver a diferença."))
                .andExpect(jsonPath("$.campos[0].campo").value("justificativa"));
        contar(empresa.operadora(), sessao, "157.00", "Confere")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Informe a justificativa depois de ver a diferença."));

        detalhe(empresa.operadora(), sessao).andExpect(jsonPath("$.status").value("ABERTA"))
                .andExpect(jsonPath("$.valorContado").value(nullValue()));
    }

    @Test
    void sangriaAcimaNoCegoParaOperadorSemValor() throws Exception {
        lancar(empresa.operadora(), sessao, "SANGRIA", "157.01")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("A sangria passa do dinheiro esperado na gaveta."))
                .andExpect(content().string(not(containsString(ESPERADO_NO_JSON))))
                .andExpect(content().string(not(containsString(ESPERADO_NA_MENSAGEM))));

        lancar(empresa.admin(), sessao, "SANGRIA", "157.01")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("A sangria passa do dinheiro na gaveta (R$ 157,00)."));
    }
}
