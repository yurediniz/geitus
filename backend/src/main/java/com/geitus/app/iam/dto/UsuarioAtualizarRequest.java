package com.geitus.app.iam.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Dados de entrada para editar um usuario existente.
 *
 * <p>Permite alterar apenas {@code nome} e {@code perfil}. E-mail e senha tem
 * fluxos proprios (unicidade de e-mail e endpoints dedicados de senha). O
 * {@code perfil} e validado contra a allow-list no service.
 */
@Schema(description = "Dados para editar um usuario")
public record UsuarioAtualizarRequest(

        @Schema(example = "Maria Operadora")
        @NotBlank(message = "Nome é obrigatório.")
        @Size(max = 150, message = "Nome deve ter no máximo 150 caracteres.")
        String nome,

        @Schema(example = "ADMIN", allowableValues = {"ADMIN", "OPERADOR"})
        @NotBlank(message = "Perfil é obrigatório.")
        String perfil) {
}
