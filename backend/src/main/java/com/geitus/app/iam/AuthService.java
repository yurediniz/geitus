package com.geitus.app.iam;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.iam.dto.LoginRequest;
import com.geitus.app.iam.dto.LoginResponse;
import com.geitus.app.iam.dto.UsuarioResponse;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Regras de negocio da autenticacao.
 *
 * <p>O login valida credenciais e emite um JWT. Por seguranca, qualquer falha
 * (usuario inexistente, senha incorreta ou usuario inativo) resulta na mesma
 * {@link CredenciaisInvalidasException}, sem revelar qual foi o motivo.
 */
@Service
public class AuthService {

    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UsuarioRepository usuarioRepository, PasswordEncoder passwordEncoder,
            JwtService jwtService) {
        this.usuarioRepository = usuarioRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {
        Usuario usuario = usuarioRepository.findByEmail(request.email())
                .orElseThrow(CredenciaisInvalidasException::new);

        if (!usuario.isAtivo()) {
            throw new CredenciaisInvalidasException();
        }

        if (!passwordEncoder.matches(request.senha(), usuario.getSenhaHash())) {
            throw new CredenciaisInvalidasException();
        }

        String token = jwtService.gerarToken(usuario);
        return new LoginResponse(token, UsuarioResponse.de(usuario));
    }

    /**
     * Carrega os dados publicos do usuario autenticado a partir do seu id.
     * Usuario inexistente ou inativo e tratado como nao autenticado.
     */
    @Transactional(readOnly = true)
    public UsuarioResponse buscarUsuarioAutenticado(Long id) {
        Usuario usuario = usuarioRepository.findById(id)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
        return UsuarioResponse.de(usuario);
    }
}
