package com.geitus.app.cashier.sessao.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.geitus.app.cashier.sessao.TipoDeMovimentoDeCaixa;

import io.swagger.v3.oas.annotations.media.Schema;

/** Movimento da sessao na API: valor sempre positivo (o sinal sai do tipo), quem lancou e quando. */
@Schema(description = "Movimento de caixa")
public record MovimentoDeCaixaResponse(
        UUID id,
        TipoDeMovimentoDeCaixa tipo,
        BigDecimal valor,
        @Schema(description = "Motivo; null na abertura") String motivo,
        String usuarioNome,
        @Schema(description = "ISO-8601 no fuso America/Sao_Paulo") OffsetDateTime criadoEm) {
}
