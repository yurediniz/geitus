package com.geitus.app.iam;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.company.Empresa;
import com.geitus.app.iam.dto.AlterarSenhaRequest;
import com.geitus.app.iam.dto.RedefinirSenhaRequest;
import com.geitus.app.iam.dto.UsuarioAtualizarRequest;
import com.geitus.app.iam.dto.UsuarioCriarRequest;
import com.geitus.app.iam.dto.UsuarioResponse;

/**
 * Testa as regras do {@link UsuarioService}: criacao, isolamento por empresa
 * (DEC-016), autoprotecao do ultimo ADMIN e fluxos de senha. Usa mock de
 * repositorio (sem banco) e BCrypt real.
 */
@ExtendWith(MockitoExtension.class)
class UsuarioServiceTest {

    private static final Long EMPRESA_ID = 7L;
    private static final Long ADMIN_AUTENTICADO_ID = 1L;

    @Mock
    private UsuarioRepository usuarioRepository;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private UsuarioService usuarioService;

    @BeforeEach
    void setUp() {
        usuarioService = new UsuarioService(usuarioRepository, passwordEncoder);
    }

    private Empresa empresa() {
        Empresa empresa = new Empresa("Empresa Teste");
        ReflectionTestUtils.setField(empresa, "id", EMPRESA_ID);
        return empresa;
    }

    private Usuario usuarioComId(Long id, String perfil, boolean ativo, String senha) {
        Usuario usuario = new Usuario(empresa(), "Usuario " + id, "user" + id + "@x.com",
                passwordEncoder.encode(senha), perfil);
        usuario.setAtivo(ativo);
        ReflectionTestUtils.setField(usuario, "id", id);
        return usuario;
    }

    private void mockAdminAutenticado() {
        when(usuarioRepository.findById(ADMIN_AUTENTICADO_ID))
                .thenReturn(Optional.of(usuarioComId(ADMIN_AUTENTICADO_ID, "ADMIN", true, "senhaAdmin1")));
    }

    // ---------- Criar ----------

    @Test
    void criarDeveAplicarBcryptENuncaExporSenha() {
        mockAdminAutenticado();
        when(usuarioRepository.existsByEmail("nova@x.com")).thenReturn(false);
        when(usuarioRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UsuarioResponse resposta = usuarioService.criarParaUsuario(ADMIN_AUTENTICADO_ID,
                new UsuarioCriarRequest("Nova Pessoa", "nova@x.com", "senhaForte1", "OPERADOR"));

        ArgumentCaptor<Usuario> captor = ArgumentCaptor.forClass(Usuario.class);
        verify(usuarioRepository).save(captor.capture());
        Usuario salvo = captor.getValue();

        assertThat(salvo.getSenhaHash()).isNotEqualTo("senhaForte1");
        assertThat(passwordEncoder.matches("senhaForte1", salvo.getSenhaHash())).isTrue();
        assertThat(salvo.getPerfil()).isEqualTo("OPERADOR");
        assertThat(resposta.email()).isEqualTo("nova@x.com");
        assertThat(resposta.perfil()).isEqualTo("OPERADOR");
    }

    @Test
    void criarComEmailDuplicadoDeveFalharComConflito() {
        mockAdminAutenticado();
        when(usuarioRepository.existsByEmail("repetido@x.com")).thenReturn(true);

        assertThatThrownBy(() -> usuarioService.criarParaUsuario(ADMIN_AUTENTICADO_ID,
                new UsuarioCriarRequest("Alguem", "repetido@x.com", "senhaForte1", "OPERADOR")))
                .isInstanceOf(ConflitoDeUsuarioException.class);

        verify(usuarioRepository, never()).save(any());
    }

    @Test
    void criarComPerfilInvalidoDeveFalharCom400() {
        mockAdminAutenticado();

        assertThatThrownBy(() -> usuarioService.criarParaUsuario(ADMIN_AUTENTICADO_ID,
                new UsuarioCriarRequest("Alguem", "alguem@x.com", "senhaForte1", "GERENTE")))
                .isInstanceOf(DadosUsuarioInvalidosException.class);

        verify(usuarioRepository, never()).save(any());
    }

    @Test
    void criarComSenhaCurtaDeveFalharCom400() {
        mockAdminAutenticado();

        assertThatThrownBy(() -> usuarioService.criarParaUsuario(ADMIN_AUTENTICADO_ID,
                new UsuarioCriarRequest("Alguem", "alguem@x.com", "curta12", "OPERADOR")))
                .isInstanceOf(DadosUsuarioInvalidosException.class);

        verify(usuarioRepository, never()).save(any());
    }

    // ---------- Isolamento por empresa ----------

    @Test
    void buscarUsuarioDeOutraEmpresaDeveRetornar404() {
        mockAdminAutenticado();
        when(usuarioRepository.findByIdAndEmpresa_Id(99L, EMPRESA_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> usuarioService.buscarParaUsuario(ADMIN_AUTENTICADO_ID, 99L))
                .isInstanceOf(UsuarioNaoEncontradoException.class);
    }

    // ---------- Atualizar ----------

    @Test
    void atualizarDeveAlterarNomeEPerfil() {
        mockAdminAutenticado();
        Usuario alvo = usuarioComId(2L, "OPERADOR", true, "senha123456");
        when(usuarioRepository.findByIdAndEmpresa_Id(2L, EMPRESA_ID)).thenReturn(Optional.of(alvo));
        when(usuarioRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UsuarioResponse resposta = usuarioService.atualizarParaUsuario(ADMIN_AUTENTICADO_ID, 2L,
                new UsuarioAtualizarRequest("Nome Novo", "ADMIN"));

        assertThat(resposta.nome()).isEqualTo("Nome Novo");
        assertThat(resposta.perfil()).isEqualTo("ADMIN");
    }

    // ---------- Inativar / reativar ----------

    @Test
    void inativarUsuarioComumDeveFuncionar() {
        mockAdminAutenticado();
        Usuario alvo = usuarioComId(2L, "OPERADOR", true, "senha123456");
        when(usuarioRepository.findByIdAndEmpresa_Id(2L, EMPRESA_ID)).thenReturn(Optional.of(alvo));
        when(usuarioRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UsuarioResponse resposta = usuarioService.inativarParaUsuario(ADMIN_AUTENTICADO_ID, 2L);

        assertThat(resposta.ativo()).isFalse();
    }

    @Test
    void reativarDeveFuncionar() {
        mockAdminAutenticado();
        Usuario alvo = usuarioComId(2L, "OPERADOR", false, "senha123456");
        when(usuarioRepository.findByIdAndEmpresa_Id(2L, EMPRESA_ID)).thenReturn(Optional.of(alvo));
        when(usuarioRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UsuarioResponse resposta = usuarioService.reativarParaUsuario(ADMIN_AUTENTICADO_ID, 2L);

        assertThat(resposta.ativo()).isTrue();
    }

    // ---------- Autoprotecao ----------

    @Test
    void inativarUltimoAdminAtivoDeveFalharComConflito() {
        mockAdminAutenticado();
        Usuario outroAdmin = usuarioComId(2L, "ADMIN", true, "senha123456");
        when(usuarioRepository.findByIdAndEmpresa_Id(2L, EMPRESA_ID)).thenReturn(Optional.of(outroAdmin));
        when(usuarioRepository.countByEmpresa_IdAndPerfilAndAtivoTrue(EMPRESA_ID, "ADMIN")).thenReturn(1L);

        assertThatThrownBy(() -> usuarioService.inativarParaUsuario(ADMIN_AUTENTICADO_ID, 2L))
                .isInstanceOf(ConflitoDeUsuarioException.class);

        verify(usuarioRepository, never()).save(any());
    }

    @Test
    void rebaixarUltimoAdminAtivoDeveFalharComConflito() {
        mockAdminAutenticado();
        Usuario alvo = usuarioComId(2L, "ADMIN", true, "senha123456");
        when(usuarioRepository.findByIdAndEmpresa_Id(2L, EMPRESA_ID)).thenReturn(Optional.of(alvo));
        when(usuarioRepository.countByEmpresa_IdAndPerfilAndAtivoTrue(EMPRESA_ID, "ADMIN")).thenReturn(1L);

        assertThatThrownBy(() -> usuarioService.atualizarParaUsuario(ADMIN_AUTENTICADO_ID, 2L,
                new UsuarioAtualizarRequest("Ainda Admin", "OPERADOR")))
                .isInstanceOf(ConflitoDeUsuarioException.class);

        verify(usuarioRepository, never()).save(any());
    }

    @Test
    void adminNaoPodeInativarASiMesmo() {
        mockAdminAutenticado();
        Usuario euMesmo = usuarioComId(ADMIN_AUTENTICADO_ID, "ADMIN", true, "senhaAdmin1");
        when(usuarioRepository.findByIdAndEmpresa_Id(ADMIN_AUTENTICADO_ID, EMPRESA_ID))
                .thenReturn(Optional.of(euMesmo));

        assertThatThrownBy(() -> usuarioService.inativarParaUsuario(ADMIN_AUTENTICADO_ID, ADMIN_AUTENTICADO_ID))
                .isInstanceOf(ConflitoDeUsuarioException.class);

        verify(usuarioRepository, never()).save(any());
    }

    // ---------- Redefinir senha (ADMIN) ----------

    @Test
    void redefinirSenhaDeveTrocarOHash() {
        mockAdminAutenticado();
        Usuario alvo = usuarioComId(2L, "OPERADOR", true, "senhaAntiga1");
        String hashAntigo = alvo.getSenhaHash();
        when(usuarioRepository.findByIdAndEmpresa_Id(2L, EMPRESA_ID)).thenReturn(Optional.of(alvo));
        when(usuarioRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        usuarioService.redefinirSenhaParaUsuario(ADMIN_AUTENTICADO_ID, 2L,
                new RedefinirSenhaRequest("senhaNova12345"));

        assertThat(alvo.getSenhaHash()).isNotEqualTo(hashAntigo);
        assertThat(passwordEncoder.matches("senhaNova12345", alvo.getSenhaHash())).isTrue();
    }

    // ---------- Trocar a propria senha ----------

    @Test
    void trocarPropriaSenhaComSenhaAtualCorretaDeveFuncionar() {
        Usuario eu = usuarioComId(ADMIN_AUTENTICADO_ID, "ADMIN", true, "senhaAtual12");
        when(usuarioRepository.findById(ADMIN_AUTENTICADO_ID)).thenReturn(Optional.of(eu));
        when(usuarioRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        usuarioService.alterarPropriaSenhaParaUsuario(ADMIN_AUTENTICADO_ID,
                new AlterarSenhaRequest("senhaAtual12", "senhaNova12345"));

        assertThat(passwordEncoder.matches("senhaNova12345", eu.getSenhaHash())).isTrue();
    }

    @Test
    void trocarPropriaSenhaComSenhaAtualIncorretaDeveFalharCom400() {
        Usuario eu = usuarioComId(ADMIN_AUTENTICADO_ID, "ADMIN", true, "senhaAtual12");
        when(usuarioRepository.findById(ADMIN_AUTENTICADO_ID)).thenReturn(Optional.of(eu));

        assertThatThrownBy(() -> usuarioService.alterarPropriaSenhaParaUsuario(ADMIN_AUTENTICADO_ID,
                new AlterarSenhaRequest("senhaErrada", "senhaNova12345")))
                .isInstanceOf(DadosUsuarioInvalidosException.class);

        verify(usuarioRepository, never()).save(any());
    }

    // ---------- Listagem ----------

    @Test
    void listarSemBuscaDeveUsarQuerySemTermo() {
        mockAdminAutenticado();
        when(usuarioRepository.buscarPorEmpresa(EMPRESA_ID, null, null))
                .thenReturn(List.of(usuarioComId(2L, "OPERADOR", true, "senha123456")));

        List<UsuarioResponse> lista = usuarioService.listarParaUsuario(ADMIN_AUTENTICADO_ID, null, null, null);

        assertThat(lista).hasSize(1);
        verify(usuarioRepository).buscarPorEmpresa(EMPRESA_ID, null, null);
    }

    @Test
    void listarComBuscaDeveUsarQueryComTermo() {
        mockAdminAutenticado();
        when(usuarioRepository.buscarPorEmpresaComBusca(EMPRESA_ID, "maria", true, "OPERADOR"))
                .thenReturn(List.of());

        usuarioService.listarParaUsuario(ADMIN_AUTENTICADO_ID, "  maria ", true, "operador");

        verify(usuarioRepository).buscarPorEmpresaComBusca(EMPRESA_ID, "maria", true, "OPERADOR");
    }
}
