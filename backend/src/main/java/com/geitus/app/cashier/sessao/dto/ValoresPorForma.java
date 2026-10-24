package com.geitus.app.cashier.sessao.dto;

import java.math.BigDecimal;

import com.geitus.app.cashier.FormaDePagamento;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Esperado, contado e diferenca de uma forma na sessao (docs/modules/pdv.md,
 * 3.9). Antes da contagem, {@code contado} e {@code diferenca} sao nulos e o
 * {@code esperado} e o atual ({@code null} para o OPERADOR no modo cego);
 * depois, a fotografia gravada.
 */
@Schema(description = "Valores de uma forma de pagamento na sessao")
public record ValoresPorForma(
        FormaDePagamento forma,
        @Schema(nullable = true) BigDecimal esperado,
        @Schema(nullable = true) BigDecimal contado,
        @Schema(description = "Contado - esperado", nullable = true) BigDecimal diferenca) {
}
