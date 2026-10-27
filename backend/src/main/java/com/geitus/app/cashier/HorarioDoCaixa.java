package com.geitus.app.cashier;

import java.time.Clock;
import java.time.OffsetDateTime;

/**
 * Horarios do caixa nas respostas: no fuso do {@link Clock} da aplicacao
 * ({@code America/Sao_Paulo}), para sair {@code 2026-10-24T08:02:00-03:00}
 * qualquer que seja o fuso da JVM (docs/modules/caixa.md).
 */
public final class HorarioDoCaixa {

    private HorarioDoCaixa() {
        // Apenas metodos estaticos.
    }

    /** O mesmo instante no fuso do relogio; {@code null} continua {@code null}. */
    public static OffsetDateTime noFuso(Clock relogio, OffsetDateTime horario) {
        return horario == null ? null : horario.atZoneSameInstant(relogio.getZone()).toOffsetDateTime();
    }
}
