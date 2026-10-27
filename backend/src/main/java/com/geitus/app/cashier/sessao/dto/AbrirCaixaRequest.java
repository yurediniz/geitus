package com.geitus.app.cashier.sessao.dto;

import java.math.BigDecimal;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

/**
 * Abertura de caixa (docs/modules/caixa.md). A {@code chave} e
 * gerada pela tela ao abrir a janela: repetir o mesmo pedido devolve a sessao
 * ja aberta (200), sem abrir outra.
 */
@Schema(description = "Abertura de caixa")
public record AbrirCaixaRequest(
        @Schema(description = "UUID do ponto de caixa")
        @NotNull(message = "Escolha o ponto de caixa.")
        UUID pontoId,

        @Schema(description = "Fundo de troco, de 0 a 9.999.999.999,99 com ate 2 casas", example = "150.00")
        @NotNull(message = "Informe o fundo de troco.")
        @DecimalMin(value = "0.00", message = "O fundo de troco não pode ser negativo.")
        @Digits(integer = 10, fraction = 2, message = MensagensDeValor.ATE_DUAS_CASAS)
        BigDecimal fundoTroco,

        @Schema(description = "Chave de idempotencia (UUID gerado pela tela)")
        @NotNull(message = MensagensDeValor.CHAVE_OBRIGATORIA)
        UUID chave) {
}
