package com.geitus.app.iam.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Dados para o proprio usuario trocar a sua senha.
 *
 * <p>Exige a {@code senhaAtual} (para evitar troca por sessao sequestrada sem
 * conhecer a senha) e a {@code novaSenha} (minimo de 8 caracteres). A
 * conferencia da senha atual e feita no service via BCrypt.
 */
@Schema(description = "Troca da propria senha")
public record AlterarSenhaRequest(

        @Schema(example = "senhaAtual123")
        @NotBlank(message = "Senha atual é obrigatória.")
        String senhaAtual,

        @Schema(example = "novaSenhaSegura123")
        @NotBlank(message = "Nova senha é obrigatória.")
        @Size(min = 8, max = 100, message = "Nova senha deve ter no mínimo 8 caracteres.")
        String novaSenha) {
}
