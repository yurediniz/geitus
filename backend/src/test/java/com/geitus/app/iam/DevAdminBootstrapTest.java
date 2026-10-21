package com.geitus.app.iam;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;

/**
 * Testa o vinculo do {@link DevAdminBootstrap} com as unidades padrao: so a
 * empresa criada pelo bootstrap recebe {@code criarPadroes}; uma empresa ja
 * existente (achada pelo nome) nao e tocada. O bean so existe com
 * {@code geitus.bootstrap.dev-admin=true}; aqui ele e instanciado direto.
 */
@ExtendWith(MockitoExtension.class)
class DevAdminBootstrapTest {

    private static final String EMAIL_ADMIN = "admin@geitus.dev";
    private static final String NOME_EMPRESA = "Empresa de Desenvolvimento";

    @Mock
    private EmpresaRepository empresaRepository;

    @Mock
    private UsuarioRepository usuarioRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private UnidadeMedidaService unidadeMedidaService;

    private DevAdminBootstrap bootstrap;

    @BeforeEach
    void criarBootstrapComCredenciais() {
        bootstrap = new DevAdminBootstrap(empresaRepository, usuarioRepository, passwordEncoder,
                unidadeMedidaService, EMAIL_ADMIN, "senha-de-teste", "Administrador", NOME_EMPRESA);
        when(usuarioRepository.existsByEmail(EMAIL_ADMIN)).thenReturn(false);
    }

    @Test
    void empresaNovaRecebeUnidadesPadrao() {
        Empresa empresaSalva = new Empresa(NOME_EMPRESA);
        when(empresaRepository.findByNome(NOME_EMPRESA)).thenReturn(Optional.empty());
        when(empresaRepository.save(any(Empresa.class))).thenReturn(empresaSalva);

        bootstrap.run(new DefaultApplicationArguments());

        verify(unidadeMedidaService).criarPadroes(empresaSalva);
        verify(usuarioRepository).save(any(Usuario.class));
    }

    @Test
    void empresaExistenteNaoRecriaPadroes() {
        when(empresaRepository.findByNome(NOME_EMPRESA)).thenReturn(Optional.of(new Empresa(NOME_EMPRESA)));

        bootstrap.run(new DefaultApplicationArguments());

        verify(unidadeMedidaService, never()).criarPadroes(any());
        verify(empresaRepository, never()).save(any());
        verify(usuarioRepository).save(any(Usuario.class));
    }
}
