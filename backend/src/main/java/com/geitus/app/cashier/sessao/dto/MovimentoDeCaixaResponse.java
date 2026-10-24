package com.geitus.app.cashier.sessao.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.geitus.app.cashier.sessao.TipoDeMovimentoDeCaixa;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Movimento da sessao na API: valor sempre positivo (o sinal sai do tipo),
 * quem lancou e quando. O {@code valor} e {@code null} para o OPERADOR no
 * modo cego, com a sessao aberta, quando o lancamento e de outra pessoa
 * (docs/modules/caixa.md, 3.6).
 */
@Schema(description = "Movimento de caixa")
public record MovimentoDeCaixaResponse(
        UUID id,
        TipoDeMovimentoDeCaixa tipo,
        @Schema(description = "Valor; null para o OPERADOR no modo cego, com a sessao aberta, em lancamento de "
                + "outra pessoa", nullable = true)
        BigDecimal valor,
        @Schema(description = "Motivo; null na abertura") String motivo,
        String usuarioNome,
        @Schema(description = "ISO-8601 no fuso America/Sao_Paulo") OffsetDateTime criadoEm) {
}
