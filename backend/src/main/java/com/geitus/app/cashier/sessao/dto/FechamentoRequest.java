package com.geitus.app.cashier.sessao.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Fechamento da sessao em conferencia, com a justificativa da diferenca (docs/modules/caixa.md). */
@Schema(description = "Fechamento do caixa em conferencia")
public record FechamentoRequest(
        @Schema(description = "Justificativa da diferenca, de 1 a 500 caracteres", example = "Troco dado a mais")
        @NotBlank(message = "Informe a justificativa.")
        @Size(max = MensagensDeValor.TAMANHO_MAXIMO_DA_JUSTIFICATIVA, message = MensagensDeValor.JUSTIFICATIVA_LONGA)
        String justificativa) {
}
