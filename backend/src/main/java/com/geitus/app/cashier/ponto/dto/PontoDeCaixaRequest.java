package com.geitus.app.cashier.ponto.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

/**
 * Cadastro ou renomeacao de ponto de caixa. O nome e aparado no service e
 * conferido ali (ate 40 caracteres depois de aparado).
 */
@Schema(description = "Nome do ponto de caixa")
public record PontoDeCaixaRequest(
        @Schema(description = "Nome, ate 40 caracteres; unico na empresa sem diferenciar maiusculas",
                example = "Caixa 2")
        @NotBlank(message = "Informe o nome do ponto de caixa.")
        String nome) {
}
