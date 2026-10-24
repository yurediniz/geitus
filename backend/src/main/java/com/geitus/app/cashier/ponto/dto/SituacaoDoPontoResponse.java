package com.geitus.app.cashier.ponto.dto;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.geitus.app.cashier.HorarioDoCaixa;
import com.geitus.app.cashier.ponto.SituacaoDoPonto;

import io.swagger.v3.oas.annotations.media.Schema;

/** Caixa aberto (ou em conferencia) no ponto; {@code null} na resposta quando o ponto esta livre. */
@Schema(description = "Sessao aberta ou em conferencia no ponto")
public record SituacaoDoPontoResponse(
        @Schema(description = "ABERTA ou EM_CONFERENCIA") String status,
        UUID sessaoId,
        String abertaPorNome,
        @Schema(description = "Abertura, ISO-8601 no fuso America/Sao_Paulo") OffsetDateTime abertaEm) {

    /** {@code null} quando o ponto esta livre. */
    public static SituacaoDoPontoResponse de(SituacaoDoPonto situacao, Clock relogio) {
        if (situacao == null) {
            return null;
        }
        return new SituacaoDoPontoResponse(situacao.status(), situacao.sessaoId(), situacao.abertaPorNome(),
                HorarioDoCaixa.noFuso(relogio, situacao.abertaEm()));
    }
}
