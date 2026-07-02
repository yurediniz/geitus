package com.upeflow.erpell.auth.dto;

import com.upeflow.erpell.user.Usuario;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica de um usuario autenticado.
 *
 * <p>NUNCA inclui a senha (hash) nem qualquer dado sensivel.
 */
@Schema(description = "Dados publicos do usuario autenticado")
public record UsuarioResponse(
        Long id,
        String nome,
        String email,
        String perfil,
        Long empresaId) {

    public static UsuarioResponse de(Usuario usuario) {
        return new UsuarioResponse(
                usuario.getId(),
                usuario.getNome(),
                usuario.getEmail(),
                usuario.getPerfil(),
                usuario.getEmpresaId());
    }
}
