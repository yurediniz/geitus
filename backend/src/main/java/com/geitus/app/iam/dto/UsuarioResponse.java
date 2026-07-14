package com.geitus.app.iam.dto;

import com.geitus.app.company.dto.EmpresaResponse;
import com.geitus.app.iam.Usuario;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica de um usuario autenticado.
 *
 * <p>NUNCA inclui a senha (hash) nem qualquer dado sensivel. A empresa vem
 * aninhada (ver DEC-016: usuario sempre vinculado a uma empresa), permitindo
 * ao front-end ler o contexto do usuario sem uma chamada adicional.
 */
@Schema(description = "Dados publicos do usuario autenticado")
public record UsuarioResponse(
        Long id,
        String nome,
        String email,
        String perfil,
        EmpresaResponse empresa) {

    public static UsuarioResponse de(Usuario usuario) {
        return new UsuarioResponse(
                usuario.getId(),
                usuario.getNome(),
                usuario.getEmail(),
                usuario.getPerfil(),
                EmpresaResponse.de(usuario.getEmpresa()));
    }
}
