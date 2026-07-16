package com.geitus.app.iam.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Dados para um ADMIN redefinir a senha de um usuario da sua empresa.
 *
 * <p>Nao exige a senha atual do alvo (e uma redefinicao administrativa). A nova
 * senha segue o minimo de 8 caracteres, revalidado no service.
 */
@Schema(description = "Nova senha definida por um ADMIN para outro usuario")
public record RedefinirSenhaRequest(

        @Schema(example = "novaSenhaSegura123")
        @NotBlank(message = "Nova senha é obrigatória.")
        @Size(min = 8, max = 100, message = "Nova senha deve ter no mínimo 8 caracteres.")
        String novaSenha) {
}
