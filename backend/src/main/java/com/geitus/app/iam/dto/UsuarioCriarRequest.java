package com.geitus.app.iam.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Dados de entrada para criar um usuario na empresa do usuario autenticado.
 *
 * <p>Nao inclui {@code empresaId} nem {@code ativo}: a empresa e sempre
 * derivada do usuario autenticado (nunca informada pelo cliente) e o usuario
 * nasce ativo. O {@code perfil} chega como texto e e validado contra a
 * allow-list no service ({@code Perfil.fromString}). A senha minima de 8
 * caracteres tambem e revalidada no service (defesa em profundidade).
 */
@Schema(description = "Dados para criar um usuario")
public record UsuarioCriarRequest(

        @Schema(example = "Maria Operadora")
        @NotBlank(message = "Nome é obrigatório.")
        @Size(max = 150, message = "Nome deve ter no máximo 150 caracteres.")
        String nome,

        @Schema(example = "maria@empresa.com")
        @NotBlank(message = "E-mail é obrigatório.")
        @Email(message = "E-mail inválido.")
        @Size(max = 180, message = "E-mail deve ter no máximo 180 caracteres.")
        String email,

        @Schema(example = "senhaSegura123")
        @NotBlank(message = "Senha é obrigatória.")
        @Size(min = 8, max = 100, message = "Senha deve ter no mínimo 8 caracteres.")
        String senha,

        @Schema(example = "OPERADOR", allowableValues = {"ADMIN", "OPERADOR"})
        @NotBlank(message = "Perfil é obrigatório.")
        String perfil) {
}
