package com.geitus.app.iam.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Resposta do login: token JWT e dados publicos do usuario.
 */
@Schema(description = "Resultado de um login bem-sucedido")
public record LoginResponse(
        String token,
        UsuarioResponse usuario) {
}
