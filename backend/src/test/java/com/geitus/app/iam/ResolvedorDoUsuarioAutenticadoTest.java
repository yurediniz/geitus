package com.geitus.app.iam;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.company.Empresa;

/**
 * Regras do {@link ResolvedorDoUsuarioAutenticado} (DT-025): a empresa, o nome
 * e o perfil vem do banco, nunca do cliente; usuario inexistente ou inativo e
 * tratado como credencial invalida.
 */
@ExtendWith(MockitoExtension.class)
class ResolvedorDoUsuarioAutenticadoTest {

    private static final Long EMPRESA_ID = 7L;
    private static final Long USUARIO_ID = 3L;

    @Mock
    private UsuarioRepository usuarioRepository;

    private ResolvedorDoUsuarioAutenticado resolvedor;

    @BeforeEach
    void setUp() {
        resolvedor = new ResolvedorDoUsuarioAutenticado(usuarioRepository);
    }

    @Test
    void devolveEmpresaNomeEPerfilDoBanco() {
        when(usuarioRepository.findById(USUARIO_ID)).thenReturn(Optional.of(usuario("OPERADOR", true)));

        UsuarioAutenticado autenticado = resolvedor.resolver(USUARIO_ID);

        assertThat(autenticado).isEqualTo(new UsuarioAutenticado(USUARIO_ID, EMPRESA_ID, "Ana Souza",
                Perfil.OPERADOR));
        assertThat(autenticado.ehAdmin()).isFalse();
    }

    @Test
    void reconheceOAdmin() {
        when(usuarioRepository.findById(USUARIO_ID)).thenReturn(Optional.of(usuario("ADMIN", true)));

        assertThat(resolvedor.resolver(USUARIO_ID).ehAdmin()).isTrue();
    }

    @Test
    void exigirAdminRecusaOperadorComAcessoNegado() {
        when(usuarioRepository.findById(USUARIO_ID)).thenReturn(Optional.of(usuario("OPERADOR", true)));
        UsuarioAutenticado operador = resolvedor.resolver(USUARIO_ID);

        assertThatThrownBy(operador::exigirAdmin).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void exigirAdminDevolveOProprioAdmin() {
        when(usuarioRepository.findById(USUARIO_ID)).thenReturn(Optional.of(usuario("ADMIN", true)));
        UsuarioAutenticado admin = resolvedor.resolver(USUARIO_ID);

        assertThat(admin.exigirAdmin()).isSameAs(admin);
    }

    @Test
    void usuarioInativoEhCredencialInvalida() {
        when(usuarioRepository.findById(USUARIO_ID)).thenReturn(Optional.of(usuario("ADMIN", false)));

        assertThatThrownBy(() -> resolvedor.resolver(USUARIO_ID)).isInstanceOf(CredenciaisInvalidasException.class);
    }

    @Test
    void idInexistenteEhCredencialInvalida() {
        when(usuarioRepository.findById(USUARIO_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> resolvedor.resolver(USUARIO_ID)).isInstanceOf(CredenciaisInvalidasException.class);
    }

    @Test
    void idNuloEhCredencialInvalida() {
        assertThatThrownBy(() -> resolvedor.resolver(null)).isInstanceOf(CredenciaisInvalidasException.class);
    }

    private static Usuario usuario(String perfil, boolean ativo) {
        Empresa empresa = new Empresa("Empresa Teste");
        ReflectionTestUtils.setField(empresa, "id", EMPRESA_ID);
        Usuario usuario = new Usuario(empresa, "Ana Souza", "ana@x.com", "hash", perfil);
        usuario.setAtivo(ativo);
        ReflectionTestUtils.setField(usuario, "id", USUARIO_ID);
        return usuario;
    }
}
