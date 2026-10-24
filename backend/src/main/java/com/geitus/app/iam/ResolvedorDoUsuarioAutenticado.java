package com.geitus.app.iam;

import org.springframework.stereotype.Component;

/**
 * Resolve o usuario autenticado a partir do id do JWT (DT-025), num lugar so,
 * para que os modulos nao dupliquem o {@code resolverEmpresaId}.
 *
 * <p>A empresa, o nome e o perfil sao lidos do banco a cada chamada: a
 * empresa nunca vem do cliente (DEC-016) e o perfil devolvido e o atual.
 * Usuario inexistente ou inativo responde como credencial invalida (401),
 * igual ao login.
 */
@Component
public class ResolvedorDoUsuarioAutenticado {

    private final UsuarioRepository usuarioRepository;

    public ResolvedorDoUsuarioAutenticado(UsuarioRepository usuarioRepository) {
        this.usuarioRepository = usuarioRepository;
    }

    /** @throws CredenciaisInvalidasException se o id for nulo, nao existir ou o usuario estiver inativo */
    public UsuarioAutenticado resolver(Long idUsuario) {
        if (idUsuario == null) {
            throw new CredenciaisInvalidasException();
        }
        Usuario usuario = usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
        return new UsuarioAutenticado(usuario.getId(), usuario.getEmpresaId(), usuario.getNome(),
                Perfil.fromString(usuario.getPerfil()));
    }
}
