package com.geitus.app.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.ZoneId;

import org.junit.jupiter.api.Test;

/** O relogio da aplicacao usa o fuso fixo do MVP (DEC-033). */
class RelogioConfigTest {

    @Test
    void relogioUsaFusoDeSaoPaulo() {
        assertThat(new RelogioConfig().relogio().getZone()).isEqualTo(ZoneId.of("America/Sao_Paulo"));
    }
}
