package com.geitus.app.iam;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;

/**
 * Testa o vinculo do {@link DevAdminBootstrap} com as unidades padrao: so a
 * empresa criada pelo bootstrap recebe {@code criarPadroes}; uma empresa ja
 * existente (achada pelo nome) nao e tocada. Tambem cobre a senha recusada
 * (curta ou o marcador do {@code .env.example}) e a condicao do bean: so existe
 * no perfil {@code dev} com {@code geitus.bootstrap.dev-admin=true}.
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

    private final ApplicationContextRunner contexto = new ApplicationContextRunner()
            .withBean(EmpresaRepository.class, () -> mock(EmpresaRepository.class))
            .withBean(UsuarioRepository.class, () -> mock(UsuarioRepository.class))
            .withBean(PasswordEncoder.class, () -> mock(PasswordEncoder.class))
            .withBean(UnidadeMedidaService.class, () -> mock(UnidadeMedidaService.class))
            .withUserConfiguration(DevAdminBootstrap.class);

    @BeforeEach
    void criarBootstrapComCredenciais() {
        bootstrap = bootstrapComSenha("senha-de-teste");
        lenient().when(usuarioRepository.existsByEmail(EMAIL_ADMIN)).thenReturn(false);
    }

    private DevAdminBootstrap bootstrapComSenha(String senha) {
        return new DevAdminBootstrap(empresaRepository, usuarioRepository, passwordEncoder,
                unidadeMedidaService, EMAIL_ADMIN, senha, "Administrador", NOME_EMPRESA);
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

    @Test
    void senhaCurtaImpedeASubidaSemMostrarOValor() {
        String curta = "1234567";

        assertThatThrownBy(() -> bootstrapComSenha(curta).run(new DefaultApplicationArguments()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("GEITUS_DEV_ADMIN_PASSWORD")
                .hasMessageContaining("8 caracteres")
                .hasMessageNotContaining(curta);
        verify(usuarioRepository, never()).save(any());
    }

    /** O marcador do .env.example e publico: copiado, qualquer um entraria como admin. */
    @Test
    void marcadorDoEnvExampleImpedeASubidaSemMostrarOValor() {
        String marcador = "troque-esta-senha";

        assertThatThrownBy(() -> bootstrapComSenha(marcador).run(new DefaultApplicationArguments()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("GEITUS_DEV_ADMIN_PASSWORD")
                .hasMessageContaining(".env.example")
                .hasMessageNotContaining(marcador);
        verify(usuarioRepository, never()).save(any());
    }

    /** O marcador recusado e o mesmo do .env.example da raiz: os dois nao podem divergir. */
    @Test
    void marcadorRecusadoEOMesmoDoEnvExample() throws IOException {
        List<String> linhas = Files.readAllLines(Path.of("..", ".env.example"), StandardCharsets.UTF_8);

        assertThat(linhas).contains("GEITUS_DEV_ADMIN_PASSWORD=" + DevAdminBootstrap.SENHA_DO_ENV_EXAMPLE);
    }

    @Test
    void comAPropriedadeMasForaDoPerfilDevNaoExiste() {
        contexto.withPropertyValues("geitus.bootstrap.dev-admin=true")
                .run(ctx -> assertThat(ctx).doesNotHaveBean(DevAdminBootstrap.class));
    }

    @Test
    void noPerfilDevSemAPropriedadeNaoExiste() {
        contexto.withPropertyValues("spring.profiles.active=dev")
                .run(ctx -> assertThat(ctx).doesNotHaveBean(DevAdminBootstrap.class));
    }

    @Test
    void noPerfilDevComAPropriedadeExiste() {
        contexto.withPropertyValues("spring.profiles.active=dev", "geitus.bootstrap.dev-admin=true")
                .run(ctx -> assertThat(ctx).hasSingleBean(DevAdminBootstrap.class));
    }
}
