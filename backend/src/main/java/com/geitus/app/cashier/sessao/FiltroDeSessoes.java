package com.geitus.app.cashier.sessao;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.UUID;

import com.geitus.app.cashier.DadosDoCaixaInvalidosException;

/**
 * Filtros do historico de sessoes (docs/modules/caixa.md), todos
 * opcionais. O periodo usa as datas de abertura no fuso do negocio
 * ({@code America/Sao_Paulo}, spec do Caixa): {@code de} inclui o dia inteiro a
 * partir da meia-noite, e {@code ate} tambem, ate a meia-noite do dia
 * seguinte (exclusiva).
 */
public record FiltroDeSessoes(UUID pontoId, StatusDaSessao status, LocalDate de, LocalDate ate) {

    static final String MENSAGEM_PERIODO_INVERTIDO = "A data inicial não pode ser depois da final.";
    static final String CAMPO_DE = "de";

    /** 400 se {@code de} for depois de {@code ate}. */
    public void validar() {
        if (de != null && ate != null && de.isAfter(ate)) {
            throw new DadosDoCaixaInvalidosException(MENSAGEM_PERIODO_INVERTIDO, CAMPO_DE);
        }
    }

    /** Inicio do periodo (inclusivo), ou {@code null} sem {@code de}. */
    public OffsetDateTime inicio(ZoneId fuso) {
        return de == null ? null : de.atStartOfDay(fuso).toOffsetDateTime();
    }

    /** Fim do periodo (exclusivo): o inicio do dia seguinte a {@code ate}, ou {@code null} sem {@code ate}. */
    public OffsetDateTime fim(ZoneId fuso) {
        return ate == null ? null : ate.plusDays(1).atStartOfDay(fuso).toOffsetDateTime();
    }
}
