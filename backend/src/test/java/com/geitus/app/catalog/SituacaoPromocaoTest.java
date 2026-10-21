package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.Test;

/**
 * Situacao calculada da promocao (docs/modules/produtos-precos.md, 4.3):
 * {@code AGENDADA} antes do inicio, {@code VIGENTE} de inicio a fim
 * (inclusive) e {@code ENCERRADA} depois do fim, pela data de Sao Paulo.
 */
class SituacaoPromocaoTest {

    private static final LocalDate INICIO = LocalDate.of(2026, 11, 1);
    private static final LocalDate FIM = LocalDate.of(2026, 11, 15);

    @Test
    void inicioIgualFimIgualHoje_vigente() {
        LocalDate hoje = LocalDate.of(2026, 11, 10);

        assertThat(SituacaoPromocao.de(hoje, hoje, hoje)).isEqualTo(SituacaoPromocao.VIGENTE);
    }

    @Test
    void antesDoInicio_agendada() {
        assertThat(SituacaoPromocao.de(INICIO, FIM, INICIO.minusDays(1))).isEqualTo(SituacaoPromocao.AGENDADA);
    }

    @Test
    void depoisDoFim_encerrada() {
        assertThat(SituacaoPromocao.de(INICIO, FIM, FIM.plusDays(1))).isEqualTo(SituacaoPromocao.ENCERRADA);
    }

    /** Review Focus 1: 01:30 UTC de 16/11 ainda e 22:30 de 15/11 em Sao Paulo. */
    @Test
    void diaDeSaoPauloNaoUtc() {
        Clock relogio = Clock.fixed(Instant.parse("2026-11-16T01:30:00Z"), ZoneId.of("America/Sao_Paulo"));

        LocalDate hoje = SituacaoPromocao.hoje(relogio);

        assertThat(hoje).isEqualTo(FIM);
        assertThat(SituacaoPromocao.de(INICIO, FIM, hoje)).isEqualTo(SituacaoPromocao.VIGENTE);
    }
}
