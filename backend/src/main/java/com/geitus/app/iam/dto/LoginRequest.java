package com.geitus.app.iam.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * Dados de entrada do login.
 *
 * <p>Validado por Bean Validation: campos vazios ou e-mail malformado resultam
 * em 400 via {@code GlobalExceptionHandler}, com detalhamento de campos.
 */
@Schema(description = "Credenciais de login")
public record LoginRequest(

        @Schema(example = "admin@geitus.dev")
        @NotBlank(message = "O e-mail e obrigatorio.")
        @Email(message = "Informe um e-mail valido.")
        String email,

        @Schema(example = "sua-senha")
        @NotBlank(message = "A senha e obrigatoria.")
        String senha) {
}
