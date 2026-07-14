package com.geitus.app.company.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

/**
 * Dados de entrada para atualizacao do nome da empresa do usuario autenticado.
 *
 * <p>Validado por Bean Validation: nome vazio ou em branco resulta em 400 via
 * {@code GlobalExceptionHandler}, com detalhamento de campos.
 */
@Schema(description = "Dados para atualizacao da empresa")
public record AtualizarEmpresaRequest(

        @Schema(example = "Mercado do Ze")
        @NotBlank(message = "O nome da empresa e obrigatorio.")
        String nome) {
}
