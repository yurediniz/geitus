package com.geitus.app.sales.venda.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

/** Cancelamento da venda (docs/modules/pdv.md, 3.8): o motivo e aparado e conferido no service (ate 200). */
@Schema(description = "Cancelamento da venda")
public record CancelamentoRequest(
        @Schema(description = "Motivo, de 1 a 200 caracteres", example = "Cliente desistiu")
        @NotBlank(message = "Informe o motivo.")
        String motivo) {
}
