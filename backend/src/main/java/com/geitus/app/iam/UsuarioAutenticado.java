package com.geitus.app.iam;

/**
 * Quem faz a requisicao, como esta no banco agora (DT-025): o id do JWT, a
 * empresa (DEC-016), o nome e o perfil. Os services usam este registro para
 * isolar por empresa e aplicar as regras de perfil e de dono sem depender da
 * entidade {@link Usuario}.
 */
public record UsuarioAutenticado(Long usuarioId, Long empresaId, String nome, Perfil perfil) {

    public boolean ehAdmin() {
        return perfil == Perfil.ADMIN;
    }
}
