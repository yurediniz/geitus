package com.geitus.app.iam;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.geitus.app.iam.Usuario;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;

/**
 * Testa a geracao e validacao de tokens do {@link JwtService}.
 */
@ExtendWith(MockitoExtension.class)
class JwtServiceTest {

    private static final String SEGREDO = "segredo-de-teste-apenas-para-os-testes-do-geitus-1234567890";
    private static final long EXPIRACAO = 86_400_000L;

    private JwtService jwtService;

    @Mock
    private Usuario usuario;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService(SEGREDO, EXPIRACAO);
    }

    @Test
    void deveGerarTokenComClaimsMinimos() {
        when(usuario.getId()).thenReturn(42L);
        when(usuario.getPerfil()).thenReturn("ADMIN");
        when(usuario.getEmpresaId()).thenReturn(7L);

        String token = jwtService.gerarToken(usuario);
        Claims claims = jwtService.extrairClaims(token);

        assertThat(claims.getSubject()).isEqualTo("42");
        assertThat(claims.get("perfil", String.class)).isEqualTo("ADMIN");
        assertThat(claims.get("empresaId", Integer.class)).isEqualTo(7);
        assertThat(jwtService.extrairIdUsuario(token)).isEqualTo(42L);
    }

    @Test
    void deveRejeitarTokenComAssinaturaInvalida() {
        when(usuario.getId()).thenReturn(1L);
        when(usuario.getPerfil()).thenReturn("ADMIN");
        when(usuario.getEmpresaId()).thenReturn(1L);

        String token = jwtService.gerarToken(usuario);

        // Outro servico com segredo diferente nao pode validar o token.
        JwtService outro = new JwtService(
                "outro-segredo-completamente-diferente-para-o-teste-987654321", EXPIRACAO);

        assertThatThrownBy(() -> outro.extrairClaims(token))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void deveRejeitarTokenAdulterado() {
        when(usuario.getId()).thenReturn(1L);
        when(usuario.getPerfil()).thenReturn("ADMIN");
        when(usuario.getEmpresaId()).thenReturn(1L);

        String token = jwtService.gerarToken(usuario);
        String adulterado = token.substring(0, token.length() - 3) + "aaa";

        assertThatThrownBy(() -> jwtService.extrairClaims(adulterado))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void deveRejeitarTokenExpirado() {
        when(usuario.getId()).thenReturn(1L);
        when(usuario.getPerfil()).thenReturn("ADMIN");
        when(usuario.getEmpresaId()).thenReturn(1L);

        // Expiracao negativa: o token ja nasce expirado.
        JwtService expirado = new JwtService(SEGREDO, -1_000L);
        String token = expirado.gerarToken(usuario);

        assertThatThrownBy(() -> jwtService.extrairClaims(token))
                .isInstanceOf(JwtException.class);
    }
}
