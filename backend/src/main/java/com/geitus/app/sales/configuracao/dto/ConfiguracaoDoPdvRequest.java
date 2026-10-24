package com.geitus.app.sales.configuracao.dto;

import java.math.BigDecimal;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

/** Alteracao da configuracao do PDV (ADMIN; docs/modules/pdv.md, 3.10). */
@Schema(description = "Configuracao do PDV")
public record ConfiguracaoDoPdvRequest(
        @Schema(description = "Quando ligado, a venda passa mesmo sem saldo e o estoque fica negativo", example = "true")
        @NotNull(message = "Informe se o PDV vende sem estoque.")
        Boolean venderSemEstoque,

        @Schema(description = "Desconto maximo do operador, de 0 a 100 com ate 2 casas", example = "10.00")
        @NotNull(message = "Informe o desconto máximo do operador.")
        @DecimalMin(value = "0", message = "O desconto máximo deve ficar entre 0 e 100%.")
        @DecimalMax(value = "100", message = "O desconto máximo deve ficar entre 0 e 100%.")
        @Digits(integer = 3, fraction = 2, message = "Informe o desconto máximo com até 2 casas decimais.")
        BigDecimal descontoMaximoOperador) {
}
