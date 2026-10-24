package com.geitus.app.cashier.sessao.dto;

import java.math.BigDecimal;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Contagem da gaveta (docs/modules/caixa.md, 3.4 e 5.3). A justificativa so
 * vale no modo nao cego, para fechar direto quando ha diferenca; no modo cego
 * ela vem depois, no fechamento.
 */
@Schema(description = "Contagem do dinheiro da gaveta")
public record ContagemRequest(
        @Schema(description = "Dinheiro contado na gaveta, de 0 a 9.999.999.999,99", example = "318.00")
        @NotNull(message = "Informe o dinheiro contado na gaveta.")
        @DecimalMin(value = "0.00", message = "O valor contado não pode ser negativo.")
        @Digits(integer = 10, fraction = 2, message = MensagensDeValor.ATE_DUAS_CASAS)
        BigDecimal valorContado,

        @Schema(description = "Justificativa da diferenca (so no modo nao cego), ate 500 caracteres")
        @Size(max = MensagensDeValor.TAMANHO_MAXIMO_DA_JUSTIFICATIVA, message = MensagensDeValor.JUSTIFICATIVA_LONGA)
        String justificativa) {
}
