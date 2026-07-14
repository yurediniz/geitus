package com.geitus.app.company;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.company.dto.EmpresaResponse;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Testa as regras do {@link EmpresaService}: a empresa manipulada e sempre
 * derivada do usuario autenticado (id extraido do token), nunca de um
 * parametro externo.
 */
@ExtendWith(MockitoExtension.class)
class EmpresaServiceTest {

    @Mock
    private UsuarioRepository usuarioRepository;

    @Mock
    private EmpresaRepository empresaRepository;

    private EmpresaService empresaService;

    @BeforeEach
    void setUp() {
        empresaService = new EmpresaService(usuarioRepository, empresaRepository);
    }

    private Usuario usuarioComEmpresa(Long idEmpresa, String nomeEmpresa) {
        Empresa empresa = new Empresa(nomeEmpresa);
        ReflectionTestUtils.setField(empresa, "id", idEmpresa);
        return new Usuario(empresa, "Admin", "admin@geitus.dev", "hash", "ADMIN");
    }

    @Test
    void buscarEmpresaDoUsuarioInexistenteDeveFalhar() {
        when(usuarioRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> empresaService.buscarEmpresaDoUsuario(99L))
                .isInstanceOf(CredenciaisInvalidasException.class);
    }

    @Test
    void buscarEmpresaDoUsuarioInativoDeveFalhar() {
        Usuario usuario = usuarioComEmpresa(7L, "Empresa Teste");
        usuario.setAtivo(false);
        when(usuarioRepository.findById(1L)).thenReturn(Optional.of(usuario));

        assertThatThrownBy(() -> empresaService.buscarEmpresaDoUsuario(1L))
                .isInstanceOf(CredenciaisInvalidasException.class);
    }

    @Test
    void buscarEmpresaDoUsuarioAtivoDeveRetornarEmpresaCorreta() {
        Usuario usuario = usuarioComEmpresa(7L, "Empresa Teste");
        when(usuarioRepository.findById(1L)).thenReturn(Optional.of(usuario));

        EmpresaResponse resposta = empresaService.buscarEmpresaDoUsuario(1L);

        assertThat(resposta.id()).isEqualTo(7L);
        assertThat(resposta.nome()).isEqualTo("Empresa Teste");
    }

    @Test
    void atualizarNomeDaEmpresaComUsuarioInexistenteDeveFalhar() {
        when(usuarioRepository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> empresaService.atualizarNomeDaEmpresa(99L, "Novo Nome"))
                .isInstanceOf(CredenciaisInvalidasException.class);
    }

    @Test
    void atualizarNomeDaEmpresaDeveAlterarApenasAEmpresaDoUsuarioAutenticado() {
        Usuario usuario = usuarioComEmpresa(7L, "Empresa Antiga");
        when(usuarioRepository.findById(1L)).thenReturn(Optional.of(usuario));
        when(empresaRepository.save(usuario.getEmpresa())).thenReturn(usuario.getEmpresa());

        EmpresaResponse resposta = empresaService.atualizarNomeDaEmpresa(1L, "Empresa Nova");

        assertThat(resposta.id()).isEqualTo(7L);
        assertThat(resposta.nome()).isEqualTo("Empresa Nova");
        assertThat(usuario.getEmpresa().getNome()).isEqualTo("Empresa Nova");
        org.mockito.Mockito.verify(empresaRepository).save(usuario.getEmpresa());
    }
}
