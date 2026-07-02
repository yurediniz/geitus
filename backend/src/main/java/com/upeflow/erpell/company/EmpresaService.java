package com.upeflow.erpell.company;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.upeflow.erpell.auth.CredenciaisInvalidasException;
import com.upeflow.erpell.company.dto.EmpresaResponse;
import com.upeflow.erpell.user.Usuario;
import com.upeflow.erpell.user.UsuarioRepository;

/**
 * Regras de negocio do contexto de empresa do usuario autenticado.
 *
 * <p>A empresa manipulada aqui e SEMPRE derivada do usuario autenticado (via
 * {@code idUsuario}, extraido do JWT) — nunca de um identificador de empresa
 * recebido como parametro. Isso evita que um usuario altere ou leia dados de
 * uma empresa que nao e a sua.
 *
 * <p>Reutiliza {@link CredenciaisInvalidasException} (ja mapeada para 401 pelo
 * {@code GlobalExceptionHandler}) para usuario inexistente ou inativo, com a
 * mesma semantica usada em {@code AuthService.buscarUsuarioAutenticado}.
 */
@Service
public class EmpresaService {

    private final UsuarioRepository usuarioRepository;
    private final EmpresaRepository empresaRepository;

    public EmpresaService(UsuarioRepository usuarioRepository, EmpresaRepository empresaRepository) {
        this.usuarioRepository = usuarioRepository;
        this.empresaRepository = empresaRepository;
    }

    @Transactional(readOnly = true)
    public EmpresaResponse buscarEmpresaDoUsuario(Long idUsuario) {
        Usuario usuario = buscarUsuarioAtivo(idUsuario);
        return EmpresaResponse.de(usuario.getEmpresa());
    }

    @Transactional
    public EmpresaResponse atualizarNomeDaEmpresa(Long idUsuario, String novoNome) {
        Usuario usuario = buscarUsuarioAtivo(idUsuario);
        Empresa empresa = usuario.getEmpresa();
        empresa.setNome(novoNome);
        empresaRepository.save(empresa);
        return EmpresaResponse.de(empresa);
    }

    private Usuario buscarUsuarioAtivo(Long idUsuario) {
        return usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
    }
}
