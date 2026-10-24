package com.geitus.app.iam;

import org.springframework.security.access.AccessDeniedException;

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

    /**
     * 403 se o perfil do banco nao for ADMIN. Complementa a regra do
     * {@code SecurityConfig}, que le o perfil do token: quem foi rebaixado
     * continua com o token antigo ate ele expirar (DT-032).
     *
     * @return o proprio usuario, para encadear
     */
    public UsuarioAutenticado exigirAdmin() {
        if (!ehAdmin()) {
            throw new AccessDeniedException("Perfil sem permissao.");
        }
        return this;
    }
}
