package com.upeflow.erpell.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.upeflow.erpell.auth.dto.LoginRequest;
import com.upeflow.erpell.auth.dto.LoginResponse;
import com.upeflow.erpell.auth.dto.UsuarioResponse;
import com.upeflow.erpell.company.Empresa;
import com.upeflow.erpell.user.Usuario;
import com.upeflow.erpell.user.UsuarioRepository;

/**
 * Testa as regras de login do {@link AuthService}.
 *
 * <p>Usa mock de repositorio (sem banco), BCrypt real e um {@link JwtService}
 * real com segredo de teste.
 */
@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    private static final String SEGREDO = "segredo-de-teste-apenas-para-os-testes-do-erpell-1234567890";
    private static final String EMAIL = "admin@erpell.dev";
    private static final String SENHA = "senha-correta-123";

    @Mock
    private UsuarioRepository usuarioRepository;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private JwtService jwtService;
    private AuthService authService;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService(SEGREDO, 86_400_000L);
        authService = new AuthService(usuarioRepository, passwordEncoder, jwtService);
    }

    private Usuario usuarioAtivo() {
        // Usuario real com hash BCrypt da senha correta. O id/empresaId ficam nulos
        // (o banco os geraria); o teste nao depende deles para o fluxo de login.
        Empresa empresa = new Empresa("Empresa Teste");
        return new Usuario(empresa, "Admin", EMAIL, passwordEncoder.encode(SENHA), "ADMIN");
    }

    @Test
    void loginComCredenciaisValidasDeveRetornarTokenEUsuario() {
        Usuario usuario = usuarioAtivo();
        org.mockito.Mockito.when(usuarioRepository.findByEmail(EMAIL)).thenReturn(Optional.of(usuario));

        LoginResponse resposta = authService.login(new LoginRequest(EMAIL, SENHA));

        assertThat(resposta.token()).isNotBlank();
        assertThat(resposta.usuario().email()).isEqualTo(EMAIL);
        assertThat(resposta.usuario().perfil()).isEqualTo("ADMIN");
        assertThat(resposta.usuario().empresa()).isNotNull();
        assertThat(resposta.usuario().empresa().nome()).isEqualTo("Empresa Teste");
    }

    @Test
    void loginComSenhaIncorretaDeveFalhar() {
        Usuario usuario = usuarioAtivo();
        org.mockito.Mockito.when(usuarioRepository.findByEmail(EMAIL)).thenReturn(Optional.of(usuario));

        assertThatThrownBy(() -> authService.login(new LoginRequest(EMAIL, "senha-errada")))
                .isInstanceOf(CredenciaisInvalidasException.class)
                .hasMessage("Credenciais inválidas.");
    }

    @Test
    void loginComUsuarioInexistenteDeveFalharComMesmaMensagem() {
        org.mockito.Mockito.when(usuarioRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(new LoginRequest(EMAIL, SENHA)))
                .isInstanceOf(CredenciaisInvalidasException.class)
                .hasMessage("Credenciais inválidas.");
    }

    @Test
    void loginComUsuarioInativoDeveFalhar() {
        Usuario usuario = usuarioAtivo();
        usuario.setAtivo(false);
        org.mockito.Mockito.when(usuarioRepository.findByEmail(EMAIL)).thenReturn(Optional.of(usuario));

        assertThatThrownBy(() -> authService.login(new LoginRequest(EMAIL, SENHA)))
                .isInstanceOf(CredenciaisInvalidasException.class)
                .hasMessage("Credenciais inválidas.");
    }

    @Test
    void buscarUsuarioAutenticadoInexistenteDeveFalhar() {
        org.mockito.Mockito.when(usuarioRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.buscarUsuarioAutenticado(99L))
                .isInstanceOf(CredenciaisInvalidasException.class);
    }

    @Test
    void buscarUsuarioAutenticadoInativoDeveFalhar() {
        // Usuario existe, mas esta inativo: deve ser tratado como nao autenticado,
        // com a mesma semantica de credencial invalida (sem revelar o motivo).
        Usuario usuario = usuarioAtivo();
        usuario.setAtivo(false);
        org.mockito.Mockito.when(usuarioRepository.findById(1L)).thenReturn(Optional.of(usuario));

        assertThatThrownBy(() -> authService.buscarUsuarioAutenticado(1L))
                .isInstanceOf(CredenciaisInvalidasException.class);
    }

    @Test
    void buscarUsuarioAutenticadoAtivoDeveRetornarDados() {
        Usuario usuario = usuarioAtivo();
        org.mockito.Mockito.when(usuarioRepository.findById(1L)).thenReturn(Optional.of(usuario));

        UsuarioResponse resposta = authService.buscarUsuarioAutenticado(1L);

        assertThat(resposta.email()).isEqualTo(EMAIL);
        assertThat(resposta.empresa()).isNotNull();
        assertThat(resposta.empresa().nome()).isEqualTo("Empresa Teste");
    }
}
