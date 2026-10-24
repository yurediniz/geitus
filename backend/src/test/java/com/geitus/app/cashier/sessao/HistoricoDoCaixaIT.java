package com.geitus.app.cashier.sessao;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;

import com.geitus.app.cashier.CenarioDeCaixa.EmpresaDeCaixa;
import com.geitus.app.cashier.IntegracaoDoCaixa;

/**
 * Historico das sessoes (docs/modules/caixa.md, 5.2 e 6.6): o OPERADOR so ve
 * as suas, filtros por ponto, situacao e periodo (datas em
 * {@code America/Sao_Paulo}), da mais recente para a mais antiga e sem os
 * movimentos.
 *
 * <p>Relogio ajustavel no lugar do {@code Clock} da aplicacao e a JVM em UTC
 * (ajustada antes de o contexto subir): uma sessao aberta as 23:30 de Sao
 * Paulo (02:30 UTC do dia seguinte) cai no dia 24 (Review Focus 2).
 */
@Import(HistoricoDoCaixaIT.RelogioDoTeste.class)
class HistoricoDoCaixaIT extends IntegracaoDoCaixa {

    private static final ZoneId SAO_PAULO = ZoneId.of("America/Sao_Paulo");
    private static TimeZone fusoOriginal;

    @Autowired
    private RelogioAjustavel relogio;

    private EmpresaDeCaixa empresa;
    private UUID caixa1;
    private UUID caixa2;

    @TestConfiguration
    static class RelogioDoTeste {

        @Bean
        @Primary
        RelogioAjustavel relogioAjustavel() {
            return new RelogioAjustavel(Instant.parse("2026-10-24T11:02:00Z"), SAO_PAULO);
        }
    }

    @BeforeAll
    static void jvmEmUtc() {
        fusoOriginal = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
    }

    @AfterAll
    static void restaurarFuso() {
        TimeZone.setDefault(fusoOriginal);
    }

    @BeforeEach
    void novaEmpresaComDoisPontos() {
        empresa = cenario.novaEmpresa();
        caixa1 = cenario.novoPonto(empresa, "Caixa 1");
        caixa2 = cenario.novoPonto(empresa, "Caixa 2");
    }

    @Test
    void operadorSoVeAsSuas() throws Exception {
        abrirCaixa(empresa.operadora(), caixa1, "10.00");
        abrirCaixa(empresa.admin(), caixa2, "20.00");

        historico(empresa.operadora(), "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(1))
                .andExpect(jsonPath("$.itens[0].abertaPorNome").value("Ana Souza"));
        historico(empresa.admin(), "").andExpect(jsonPath("$.totalItens").value(2));
    }

    @Test
    void filtrosPontoEStatus() throws Exception {
        UUID fechada = abrirCaixa(empresa.operadora(), caixa1, "10.00");
        contar(empresa.operadora(), fechada, "10.00", null).andExpect(jsonPath("$.status").value("FECHADA"));
        abrirCaixa(empresa.admin(), caixa2, "20.00");

        historico(empresa.admin(), "?pontoId=" + caixa1).andExpect(jsonPath("$.totalItens").value(1))
                .andExpect(jsonPath("$.itens[0].id").value(fechada.toString()));
        historico(empresa.admin(), "?status=ABERTA").andExpect(jsonPath("$.totalItens").value(1))
                .andExpect(jsonPath("$.itens[0].ponto.nome").value("Caixa 2"));
        historico(empresa.admin(), "?status=FECHADA&pontoId=" + caixa2).andExpect(jsonPath("$.totalItens").value(0));
        historico(empresa.admin(), "?pontoId=" + UUID.randomUUID()).andExpect(jsonPath("$.totalItens").value(0));
        historico(empresa.admin(), "?status=TALVEZ").andExpect(status().isBadRequest());
    }

    /** Review Focus 2: 23:30 em Sao Paulo, 02:30 UTC do dia 25. */
    @Test
    void sessaoAs2330DeSaoPauloCaiNoDia24() throws Exception {
        relogio.ajustar(Instant.parse("2026-10-25T02:30:00Z"));
        UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "10.00");

        detalhe(empresa.operadora(), sessao).andExpect(jsonPath("$.abertaEm").value("2026-10-24T23:30:00-03:00"));
        historico(empresa.admin(), "?de=2026-10-24&ate=2026-10-24").andExpect(jsonPath("$.totalItens").value(1));
        historico(empresa.admin(), "?de=2026-10-25&ate=2026-10-25").andExpect(jsonPath("$.totalItens").value(0));
        historico(empresa.admin(), "?de=2026-10-25").andExpect(jsonPath("$.totalItens").value(0));
        historico(empresa.admin(), "?ate=2026-10-24").andExpect(jsonPath("$.totalItens").value(1));
        historico(empresa.admin(), "?ate=2026-10-23").andExpect(jsonPath("$.totalItens").value(0));
    }

    @Test
    void periodoInvertido400() throws Exception {
        historico(empresa.admin(), "?de=2026-10-25&ate=2026-10-24").andExpect(status().isBadRequest());
        historico(empresa.admin(), "?tamanho=101").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("O tamanho da página deve ser entre 1 e 100."))
                .andExpect(jsonPath("$.campos").doesNotExist());
    }

    @Test
    void ordemMaisRecentePrimeiro() throws Exception {
        relogio.ajustar(Instant.parse("2026-10-20T11:00:00Z"));
        UUID primeira = abrirCaixa(empresa.operadora(), caixa1, "10.00");
        contar(empresa.operadora(), primeira, "10.00", null);
        relogio.ajustar(Instant.parse("2026-10-22T11:00:00Z"));
        UUID segunda = abrirCaixa(empresa.operadora(), caixa1, "10.00");
        contar(empresa.operadora(), segunda, "10.00", null);
        relogio.ajustar(Instant.parse("2026-10-21T11:00:00Z"));
        UUID entreAsDuas = abrirCaixa(empresa.admin(), caixa2, "10.00");

        historico(empresa.admin(), "")
                .andExpect(jsonPath("$.itens[0].id").value(segunda.toString()))
                .andExpect(jsonPath("$.itens[1].id").value(entreAsDuas.toString()))
                .andExpect(jsonPath("$.itens[2].id").value(primeira.toString()));
    }

    @Test
    void paginaSemMovimentos() throws Exception {
        for (int vez = 0; vez < 3; vez++) {
            UUID sessao = abrirCaixa(empresa.operadora(), caixa1, "10.00");
            contar(empresa.operadora(), sessao, "10.00", null);
        }

        historico(empresa.operadora(), "?pagina=1&tamanho=2")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pagina").value(1))
                .andExpect(jsonPath("$.tamanho").value(2))
                .andExpect(jsonPath("$.totalItens").value(3))
                .andExpect(jsonPath("$.itens", hasSize(1)))
                .andExpect(jsonPath("$.itens[0].valorContado").value(10.0))
                .andExpect(jsonPath("$.itens[0].movimentos").doesNotExist());
    }

    /** {@link Clock} com o instante ajustavel pelo teste e o fuso do negocio. */
    static final class RelogioAjustavel extends Clock {

        private final AtomicReference<Instant> instante;
        private final ZoneId fuso;

        RelogioAjustavel(Instant inicial, ZoneId fuso) {
            this.instante = new AtomicReference<>(inicial);
            this.fuso = fuso;
        }

        void ajustar(Instant novo) {
            instante.set(novo);
        }

        @Override
        public ZoneId getZone() {
            return fuso;
        }

        @Override
        public Clock withZone(ZoneId zona) {
            return new RelogioAjustavel(instante.get(), zona);
        }

        @Override
        public Instant instant() {
            return instante.get();
        }
    }
}
