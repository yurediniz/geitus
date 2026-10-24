package com.geitus.app.cashier.sessao;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.geitus.app.cashier.CenarioDeCaixa;
import com.geitus.app.cashier.CenarioDeCaixa.EmpresaDeCaixa;
import com.geitus.app.cashier.IntegracaoDoCaixa;

/**
 * Sessoes de caixa pela API (docs/modules/caixa.md, 3.2 a 3.7 e 8
 * "Backend"): abertura, sangria e suprimento, limite do caixa, contagem e
 * fechamento nos dois modos, idempotencia, regra do dono e isolamento.
 */
class SessoesDeCaixaIT extends IntegracaoDoCaixa {

    private static final String ADMIN = CenarioDeCaixa.NOME_DO_ADMIN;
    private static final String ANA = CenarioDeCaixa.NOME_DA_OPERADORA;

    private EmpresaDeCaixa empresa;
    private UUID caixa1;

    @BeforeEach
    void novaEmpresaComCaixa1() {
        empresa = cenario.novaEmpresa();
        caixa1 = cenario.novoPonto(empresa, "Caixa 1");
    }

    // ---------- Abertura ----------

    @Test
    void abreComFundoZero201() throws Exception {
        abrir(empresa.operadora(), caixa1, "0", UUID.randomUUID())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.ponto.id").value(caixa1.toString()))
                .andExpect(jsonPath("$.ponto.nome").value("Caixa 1"))
                .andExpect(jsonPath("$.status").value("ABERTA"))
                .andExpect(jsonPath("$.abertaPorNome").value(ANA))
                .andExpect(jsonPath("$.abertaEm").value(endsWith("-03:00")))
                .andExpect(jsonPath("$.fundoTroco").value(0.0))
                .andExpect(jsonPath("$.fechamentoCego").value(true))
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(nullValue()))
                .andExpect(jsonPath("$.valorContado").value(nullValue()))
                .andExpect(jsonPath("$.movimentos", hasSize(1)))
                .andExpect(jsonPath("$.movimentos[0].tipo").value("ABERTURA"))
                .andExpect(jsonPath("$.movimentos[0].valor").value(0.0))
                .andExpect(jsonPath("$.movimentos[0].motivo").value(nullValue()))
                .andExpect(jsonPath("$.movimentos[0].usuarioNome").value(ANA))
                .andExpect(jsonPath("$.podeOperar").value(true));

        atual(empresa.operadora()).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ABERTA"));
    }

    @Test
    void fundoNegativoOuTresCasas400() throws Exception {
        abrir(empresa.operadora(), caixa1, "-0.01", UUID.randomUUID()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("fundoTroco"));
        abrir(empresa.operadora(), caixa1, "1.005", UUID.randomUUID()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("fundoTroco"));
        abrir(empresa.operadora(), caixa1, "10000000000.00", UUID.randomUUID()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("fundoTroco"));
        abrir(empresa.operadora(), caixa1, "null", UUID.randomUUID()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("fundoTroco"));

        atual(empresa.operadora()).andExpect(status().isNoContent());
    }

    @Test
    void pontoInativo409() throws Exception {
        cenario.inativarPonto(caixa1);

        abrir(empresa.operadora(), caixa1, "100", UUID.randomUUID())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Este ponto de caixa está inativo."));
    }

    @Test
    void pontoInexistente404() throws Exception {
        abrir(empresa.operadora(), UUID.randomUUID(), "100", UUID.randomUUID()).andExpect(status().isNotFound());
    }

    @Test
    void pontoOcupado409ComNomeDeQuemAbriu() throws Exception {
        abrirCaixa(empresa.operadora(), caixa1, "100");

        abrir(empresa.admin(), caixa1, "50", UUID.randomUUID())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("O Caixa 1 já está aberto por Ana Souza."));
    }

    @Test
    void usuarioComOutroCaixa409() throws Exception {
        UUID caixa2 = cenario.novoPonto(empresa, "Caixa 2");
        abrirCaixa(empresa.operadora(), caixa2, "100");

        abrir(empresa.operadora(), caixa1, "100", UUID.randomUUID())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Você já tem um caixa aberto no Caixa 2."));
    }

    @Test
    void adminComOutroCaixa409() throws Exception {
        UUID caixa2 = cenario.novoPonto(empresa, "Caixa 2");
        abrirCaixa(empresa.admin(), caixa2, "100");

        abrir(empresa.admin(), caixa1, "100", UUID.randomUUID())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Você já tem um caixa aberto no Caixa 2."));
    }

    @Test
    void chaveRepetida200MesmaSessao() throws Exception {
        UUID chave = UUID.randomUUID();
        String primeira = abrir(empresa.operadora(), caixa1, "150.00", chave).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String sessao = com.jayway.jsonpath.JsonPath.read(primeira, "$.id");

        abrir(empresa.operadora(), caixa1, "150", chave)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(sessao))
                .andExpect(jsonPath("$.movimentos", hasSize(1)));
        assertThat(contarSessoes()).isEqualTo(1);
    }

    @Test
    void chaveRepetidaOutroFundo409() throws Exception {
        UUID chave = UUID.randomUUID();
        abrir(empresa.operadora(), caixa1, "150.00", chave).andExpect(status().isCreated());

        abrir(empresa.operadora(), caixa1, "151.00", chave)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Esta operação já foi registrada com outros dados."));
    }

    // ---------- Sessao atual ----------

    @Test
    void atualDevolve204SemCaixa() throws Exception {
        atual(empresa.operadora()).andExpect(status().isNoContent());

        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100");
        contar(empresa.operadora(), sessao, "100", null).andExpect(status().isOk());

        atual(empresa.operadora()).andExpect(status().isNoContent());
    }

    // ---------- Sangria e suprimento ----------

    @Test
    void sangriaIgualAoEsperadoDeixaZero() throws Exception {
        fechamentoCego(empresa, false);
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");

        lancar(empresa.operadora(), sessao, "SUPRIMENTO", "50.00", " Troco do banco ", UUID.randomUUID())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(150.0));
        lancar(empresa.operadora(), sessao, "SANGRIA", "150.00", "Depósito no cofre", UUID.randomUUID())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(0.0))
                .andExpect(jsonPath("$.movimentos", hasSize(3)))
                .andExpect(jsonPath("$.movimentos[0].tipo").value("SANGRIA"))
                .andExpect(jsonPath("$.movimentos[0].motivo").value("Depósito no cofre"))
                .andExpect(jsonPath("$.movimentos[1].tipo").value("SUPRIMENTO"))
                .andExpect(jsonPath("$.movimentos[1].motivo").value("Troco do banco"))
                .andExpect(jsonPath("$.movimentos[2].tipo").value("ABERTURA"));

        lancar(empresa.operadora(), sessao, "SANGRIA", "0.01")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("A sangria passa do dinheiro na gaveta (R$ 0,00)."));
        contar(empresa.operadora(), sessao, "0", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"))
                .andExpect(jsonPath("$.diferenca").value(0.0));
    }

    /** Spec 3.7: a chave identifica o pedido; a repeticao depois do fechamento devolve o que foi gravado. */
    @Test
    void sangriaRepetidaPelaChaveDepoisDoFechamento200() throws Exception {
        fechamentoCego(empresa, false);
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        UUID chave = UUID.randomUUID();
        lancar(empresa.operadora(), sessao, "SANGRIA", "30.00", "Cofre", chave).andExpect(status().isCreated());
        contar(empresa.operadora(), sessao, "70.00", null).andExpect(jsonPath("$.status").value("FECHADA"));

        lancar(empresa.operadora(), sessao, "SANGRIA", "30.00", "Cofre", chave)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"))
                .andExpect(jsonPath("$.movimentos", hasSize(2)));
    }

    @Test
    void sangriaUmCentavoAcima409ComValor() throws Exception {
        fechamentoCego(empresa, false);
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "50.00");

        lancar(empresa.operadora(), sessao, "SANGRIA", "50.01")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("A sangria passa do dinheiro na gaveta (R$ 50,00)."));
    }

    @Test
    void motivoVazio400() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "50.00");

        lancar(empresa.operadora(), sessao, "SUPRIMENTO", "10", "   ", UUID.randomUUID())
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.campos[0].campo").value("motivo"));
        lancar(empresa.operadora(), sessao, "SUPRIMENTO", "10", null, UUID.randomUUID())
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.campos[0].campo").value("motivo"));
        lancar(empresa.operadora(), sessao, "SUPRIMENTO", "10", "m".repeat(201), UUID.randomUUID())
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.campos[0].campo").value("motivo"));
    }

    @Test
    void valorZeroOuTresCasasOuTipoAbertura400() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "50.00");

        lancar(empresa.operadora(), sessao, "SUPRIMENTO", "0").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("valor"));
        lancar(empresa.operadora(), sessao, "SUPRIMENTO", "1.001").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("valor"));
        lancar(empresa.operadora(), sessao, "ABERTURA", "10").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("tipo"));
    }

    @Test
    void lancamentoRepetidoPelaChave200SemDuplicar() throws Exception {
        fechamentoCego(empresa, false);
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        UUID chave = UUID.randomUUID();

        lancar(empresa.operadora(), sessao, "SUPRIMENTO", "20", "Troco", chave).andExpect(status().isCreated());
        lancar(empresa.operadora(), sessao, "SUPRIMENTO", "20.00", "Troco", chave)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(120.0))
                .andExpect(jsonPath("$.movimentos", hasSize(2)));
        lancar(empresa.operadora(), sessao, "SANGRIA", "20.00", "Troco", chave)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Esta operação já foi registrada com outros dados."));
    }

    @Test
    void lancamentoEmConferencia409() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        contar(empresa.operadora(), sessao, "90", null).andExpect(jsonPath("$.status").value("EM_CONFERENCIA"));

        lancar(empresa.operadora(), sessao, "SUPRIMENTO", "10")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("O caixa está em conferência. Termine o fechamento."));
    }

    @Test
    void lancamentoEmFechada409() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        contar(empresa.operadora(), sessao, "100", null).andExpect(jsonPath("$.status").value("FECHADA"));

        lancar(empresa.operadora(), sessao, "SANGRIA", "10")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Este caixa já foi fechado."));
    }

    // ---------- Limite do caixa (Review Focus 3) ----------

    @Test
    void suprimentoQuePassaDoLimite400() throws Exception {
        UUID sessao = abrirCaixa(empresa.admin(), caixa1, "9999999999.00");

        lancar(empresa.admin(), sessao, "SUPRIMENTO", "1.00")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("O valor passa do limite do caixa."))
                .andExpect(jsonPath("$.campos[0].campo").value("valor"));
        lancar(empresa.admin(), sessao, "SUPRIMENTO", "0.99")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.dinheiroNaGaveta").value(9999999999.99));
    }

    // ---------- Contagem ----------

    @Test
    void contagemSemDiferencaFechaNosDoisModos() throws Exception {
        UUID cega = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        contar(empresa.operadora(), cega, "100.00", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"))
                .andExpect(jsonPath("$.fechamentoCego").value(true))
                .andExpect(jsonPath("$.valorEsperado").value(100.0))
                .andExpect(jsonPath("$.valorContado").value(100.0))
                .andExpect(jsonPath("$.diferenca").value(0.0))
                .andExpect(jsonPath("$.contadaPorNome").value(ANA))
                .andExpect(jsonPath("$.contadaEm").value(endsWith("-03:00")))
                .andExpect(jsonPath("$.fechadaPorNome").value(ANA))
                .andExpect(jsonPath("$.fechadaEm").value(endsWith("-03:00")))
                .andExpect(jsonPath("$.justificativa").value(nullValue()))
                .andExpect(jsonPath("$.podeOperar").value(false));

        fechamentoCego(empresa, false);
        UUID visivel = abrirCaixa(empresa.operadora(), caixa1, "80.00");
        contar(empresa.operadora(), visivel, "80", "nada a dizer")
                .andExpect(jsonPath("$.status").value("FECHADA"))
                .andExpect(jsonPath("$.fechamentoCego").value(false))
                .andExpect(jsonPath("$.justificativa").value(nullValue()));
    }

    @Test
    void contagemComDiferencaNaoCegoComJustificativaFecha() throws Exception {
        fechamentoCego(empresa, false);
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");

        contar(empresa.operadora(), sessao, "98.00", "  Troco dado a mais ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"))
                .andExpect(jsonPath("$.diferenca").value(-2.0))
                .andExpect(jsonPath("$.justificativa").value("Troco dado a mais"))
                .andExpect(jsonPath("$.fechadaPorNome").value(ANA));
    }

    @Test
    void contagemComDiferencaNaoCegoSemJustificativaFicaEmConferencia() throws Exception {
        fechamentoCego(empresa, false);
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");

        contar(empresa.operadora(), sessao, "103", "   ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("EM_CONFERENCIA"))
                .andExpect(jsonPath("$.diferenca").value(3.0))
                .andExpect(jsonPath("$.fechadaPorNome").value(nullValue()));
        fechar(empresa.operadora(), sessao, "Sobra de troco")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"))
                .andExpect(jsonPath("$.justificativa").value("Sobra de troco"));
    }

    /** Review Focus 1: a rede cai depois da contagem e a tela confere de novo com o mesmo valor. */
    @Test
    void contagemRepetidaMesmoValor200() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        contar(empresa.operadora(), sessao, "90.00", null).andExpect(status().isOk());

        contar(empresa.operadora(), sessao, "90", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("EM_CONFERENCIA"))
                .andExpect(jsonPath("$.valorContado").value(90.0))
                .andExpect(jsonPath("$.diferenca").value(-10.0));

        fechar(empresa.operadora(), sessao, "Falta").andExpect(status().isOk());
        contar(empresa.operadora(), sessao, "90", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"));
    }

    @Test
    void contagemOutroValor409() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        contar(empresa.operadora(), sessao, "90.00", null).andExpect(status().isOk());

        contar(empresa.operadora(), sessao, "91.00", null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("A contagem deste caixa já foi registrada."));
    }

    @Test
    void contagemNegativaOuSemValor400() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");

        contar(empresa.operadora(), sessao, "-1", null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("valorContado"));
        contar(empresa.operadora(), sessao, "null", null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("valorContado"));
        contar(empresa.operadora(), sessao, "1.005", null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("valorContado"));
        contar(empresa.operadora(), sessao, "10000000000.00", null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("valorContado"));
        detalhe(empresa.operadora(), sessao).andExpect(jsonPath("$.status").value("ABERTA"));
    }

    /** O modo que vale e o do momento da contagem, nas duas direcoes (spec 3.4). */
    @Test
    void modoTrocadoAntesDaContagemValeOModoDaContagem() throws Exception {
        UUID abertaNoCego = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        fechamentoCego(empresa, false);
        contar(empresa.operadora(), abertaNoCego, "98.00", "Troco a mais")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"))
                .andExpect(jsonPath("$.fechamentoCego").value(false))
                .andExpect(jsonPath("$.justificativa").value("Troco a mais"));

        UUID abertaSemCego = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        fechamentoCego(empresa, true);
        contar(empresa.operadora(), abertaSemCego, "98.00", "Troco a mais")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Informe a justificativa depois de ver a diferença."));
        contar(empresa.operadora(), abertaSemCego, "98.00", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("EM_CONFERENCIA"))
                .andExpect(jsonPath("$.fechamentoCego").value(true));
    }

    // ---------- Fechamento ----------

    @Test
    void fechamentoSemJustificativaOuEspacos400() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        contar(empresa.operadora(), sessao, "90.00", null);

        fechar(empresa.operadora(), sessao, null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("justificativa"));
        fechar(empresa.operadora(), sessao, "   ").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("justificativa"));
        fechar(empresa.operadora(), sessao, "j".repeat(501)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("justificativa"));
    }

    @Test
    void fechamentoRepetidoMesmaJustificativa200() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        contar(empresa.operadora(), sessao, "90.00", null);
        fechar(empresa.operadora(), sessao, "Troco a mais").andExpect(status().isOk());

        fechar(empresa.operadora(), sessao, " Troco a mais ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"))
                .andExpect(jsonPath("$.justificativa").value("Troco a mais"));
    }

    @Test
    void fechamentoOutraJustificativa409() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        contar(empresa.operadora(), sessao, "90.00", null);
        fechar(empresa.operadora(), sessao, "Troco a mais").andExpect(status().isOk());

        fechar(empresa.operadora(), sessao, "Outra coisa")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Este caixa já foi fechado."));
    }

    @Test
    void fechamentoSemContagem409() throws Exception {
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "100.00");

        fechar(empresa.operadora(), sessao, "Sem contar")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Conte o dinheiro da gaveta antes de fechar o caixa."));
        detalhe(empresa.operadora(), sessao).andExpect(jsonPath("$.status").value("ABERTA"));
    }

    @Test
    void trocarModoDepoisDaContagemNaoMudaSessao() throws Exception {
        UUID aberta = abrirCaixa(empresa.admin(), caixa1, "10.00");
        UUID contada = abrirCaixa(empresa.operadora(), cenario.novoPonto(empresa, "Caixa 2"), "100.00");
        contar(empresa.operadora(), contada, "90.00", null).andExpect(jsonPath("$.fechamentoCego").value(true));

        fechamentoCego(empresa, false);

        detalhe(empresa.operadora(), contada)
                .andExpect(jsonPath("$.status").value("EM_CONFERENCIA"))
                .andExpect(jsonPath("$.fechamentoCego").value(true));
        detalhe(empresa.admin(), aberta).andExpect(jsonPath("$.fechamentoCego").value(false));
        fechar(empresa.operadora(), contada, "Falta").andExpect(status().isOk())
                .andExpect(jsonPath("$.fechamentoCego").value(true));
    }

    // ---------- Permissoes ----------

    @Test
    void operadorEmSessaoDeOutro404() throws Exception {
        Long bruno = cenario.novoUsuario(empresa, "Bruno Lima", "OPERADOR");
        UUID daAna = abrirCaixa(empresa.operadora(), caixa1, "100.00");

        detalhe(bruno, daAna).andExpect(status().isNotFound());
        lancar(bruno, daAna, "SUPRIMENTO", "10").andExpect(status().isNotFound());
        contar(bruno, daAna, "100", null).andExpect(status().isNotFound());
        fechar(bruno, daAna, "Tentativa").andExpect(status().isNotFound());

        detalhe(empresa.operadora(), daAna).andExpect(jsonPath("$.status").value("ABERTA"))
                .andExpect(jsonPath("$.movimentos", hasSize(1)));
    }

    /** Review Focus 5: o ADMIN com o proprio caixa aberto fecha o da operadora. */
    @Test
    void adminFechaSessaoDeOutroERegistraAdmin() throws Exception {
        UUID caixa2 = cenario.novoPonto(empresa, "Caixa 2");
        UUID doAdmin = abrirCaixa(empresa.admin(), caixa2, "30.00");
        UUID daAna = abrirCaixa(empresa.operadora(), caixa1, "100.00");

        lancar(empresa.admin(), daAna, "SUPRIMENTO", "20").andExpect(status().isCreated())
                .andExpect(jsonPath("$.movimentos[0].usuarioNome").value(ADMIN));
        contar(empresa.admin(), daAna, "110.00", null)
                .andExpect(jsonPath("$.status").value("EM_CONFERENCIA"))
                .andExpect(jsonPath("$.contadaPorNome").value(ADMIN));
        fechar(empresa.admin(), daAna, "Falta conferida com a Ana")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"))
                .andExpect(jsonPath("$.abertaPorNome").value(ANA))
                .andExpect(jsonPath("$.fechadaPorNome").value(ADMIN));

        atual(empresa.admin())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(doAdmin.toString()))
                .andExpect(jsonPath("$.status").value("ABERTA"))
                .andExpect(jsonPath("$.ponto.nome").value("Caixa 2"))
                .andExpect(jsonPath("$.movimentos", hasSize(1)));
        atual(empresa.operadora()).andExpect(status().isNoContent());
    }

    /** Spec 3.5: usuario inativado com caixa aberto; o ADMIN fecha no lugar dele. */
    @Test
    void adminFechaCaixaDeUsuarioInativado() throws Exception {
        String tokenDaAna = cenario.token(empresa.operadora());
        UUID daAna = abrirCaixa(empresa.operadora(), caixa1, "100.00");
        cenario.inativarUsuario(empresa.operadora());

        mockMvc.perform(get("/api/caixa/sessoes/atual").header("Authorization", tokenDaAna))
                .andExpect(status().isUnauthorized());
        pontos(empresa.admin())
                .andExpect(jsonPath("$[0].situacao.sessaoId").value(daAna.toString()))
                .andExpect(jsonPath("$[0].situacao.abertaPorNome").value(ANA));
        contar(empresa.admin(), daAna, "90.00", null)
                .andExpect(jsonPath("$.status").value("EM_CONFERENCIA"))
                .andExpect(jsonPath("$.abertaPorNome").value(ANA));
        fechar(empresa.admin(), daAna, "Falta conferida pelo administrador")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FECHADA"))
                .andExpect(jsonPath("$.fechadaPorNome").value(ADMIN));
    }

    @Test
    void sessaoDeOutraEmpresa404() throws Exception {
        EmpresaDeCaixa outra = cenario.novaEmpresa();
        UUID daA = abrirCaixa(empresa.operadora(), caixa1, "100.00");

        detalhe(outra.admin(), daA).andExpect(status().isNotFound());
        lancar(outra.admin(), daA, "SUPRIMENTO", "10").andExpect(status().isNotFound());
        contar(outra.admin(), daA, "100", null).andExpect(status().isNotFound());
        fechar(outra.admin(), daA, "x").andExpect(status().isNotFound());
        abrir(outra.admin(), caixa1, "10", UUID.randomUUID()).andExpect(status().isNotFound());
        detalhe(empresa.operadora(), daA).andExpect(jsonPath("$.status").value("ABERTA"));
    }

    private long contarSessoes() {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM sessoes_caixa WHERE empresa_id = ?", Long.class,
                empresa.id());
    }
}
