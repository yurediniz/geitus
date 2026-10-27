package com.geitus.app.cashier.sessao.dto;

import java.math.BigDecimal;
import java.util.UUID;

import com.geitus.app.cashier.sessao.TipoDeMovimentoDeCaixa;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * Sangria ou suprimento (docs/modules/caixa.md). O motivo e
 * aparado no service e conferido ali (ate 200 caracteres). A {@code chave}
 * torna o pedido repetido inofensivo.
 */
@Schema(description = "Sangria ou suprimento")
public record MovimentoDeCaixaRequest(
        @Schema(description = "SANGRIA ou SUPRIMENTO")
        @NotNull(message = "Escolha sangria ou suprimento.")
        TipoDeMovimentoDeCaixa tipo,

        @Schema(description = "Valor maior que zero, ate 9.999.999.999,99 com ate 2 casas", example = "200.00")
        @NotNull(message = "Informe o valor.")
        @DecimalMin(value = "0.00", inclusive = false, message = "O valor deve ser maior que zero.")
        @Digits(integer = 10, fraction = 2, message = MensagensDeValor.ATE_DUAS_CASAS)
        BigDecimal valor,

        @Schema(description = "Motivo, ate 200 caracteres", example = "Depósito no cofre")
        @NotBlank(message = "Informe o motivo.")
        String motivo,

        @Schema(description = "Chave de idempotencia (UUID gerado pela tela)")
        @NotNull(message = MensagensDeValor.CHAVE_OBRIGATORIA)
        UUID chave) {
}
