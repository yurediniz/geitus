package com.upeflow.erpell.auth;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.upeflow.erpell.auth.dto.LoginResponse;
import com.upeflow.erpell.auth.dto.UsuarioResponse;
import com.upeflow.erpell.company.Empresa;
import com.upeflow.erpell.company.dto.EmpresaResponse;
import com.upeflow.erpell.config.RestAccessDeniedHandler;
import com.upeflow.erpell.config.RestAuthenticationEntryPoint;
import com.upeflow.erpell.config.SecurityConfig;
import com.upeflow.erpell.shared.error.GlobalExceptionHandler;
import com.upeflow.erpell.user.Usuario;

/**
 * Testa o contrato HTTP dos endpoints de autenticacao e as regras de seguranca
 * (rotas publicas x protegidas), usando uma fatia web sem banco de dados.
 *
 * <p>O {@link JwtService} e um bean real (para gerar/validar tokens de teste); o
 * {@link AuthService} e mockado para controlar os cenarios de login.
 */
@WebMvcTest(AuthController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtService.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class,
        GlobalExceptionHandler.class
})
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private AuthService authService;

    private static final String LOGIN_VALIDO = """
            { "email": "admin@erpell.dev", "senha": "senha-correta-123" }
            """;

    @Test
    void loginValidoDeveRetornar200ComToken() throws Exception {
        UsuarioResponse usuario = new UsuarioResponse(1L, "Admin", "admin@erpell.dev", "ADMIN", empresaFake());
        when(authService.login(any())).thenReturn(new LoginResponse("token-fake", usuario));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(LOGIN_VALIDO))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("token-fake"))
                .andExpect(jsonPath("$.usuario.id").value(1))
                .andExpect(jsonPath("$.usuario.email").value("admin@erpell.dev"))
                .andExpect(jsonPath("$.usuario.perfil").value("ADMIN"))
                .andExpect(jsonPath("$.usuario.empresa.id").value(7))
                .andExpect(jsonPath("$.usuario.empresa.nome").value("Empresa Teste"))
                // Nunca deve vazar hash de senha
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("senha_hash"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("senhaHash"))));
    }

    @Test
    void loginComCredencialInvalidaDeveRetornar401() throws Exception {
        when(authService.login(any())).thenThrow(new CredenciaisInvalidasException());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(LOGIN_VALIDO))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.mensagem").value("Credenciais inválidas."))
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void loginComCamposVaziosDeveRetornar400() throws Exception {
        String vazio = "{ \"email\": \"\", \"senha\": \"\" }";

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(vazio))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.campos").isArray());
    }

    @Test
    void loginComEmailInvalidoDeveRetornar400() throws Exception {
        String invalido = "{ \"email\": \"nao-e-email\", \"senha\": \"alguma-senha\" }";

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalido))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos").isArray());
    }

    @Test
    void meSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    /**
     * Apenas {@code POST /api/auth/login} e liberado no SecurityConfig. Um
     * {@code GET /api/auth/login} nao e publico: cai em
     * {@code anyRequest().authenticated()} e, sem autenticacao, deve retornar 401.
     */
    @Test
    void getLoginDeveExigirAutenticacao() throws Exception {
        mockMvc.perform(get("/api/auth/login"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void meComTokenValidoDeveRetornar200() throws Exception {
        UsuarioResponse usuario = new UsuarioResponse(1L, "Admin", "admin@erpell.dev", "ADMIN", empresaFake());
        when(authService.buscarUsuarioAutenticado(1L)).thenReturn(usuario);

        String token = jwtService.gerarToken(criarUsuario(1L, "ADMIN"));

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.email").value("admin@erpell.dev"))
                .andExpect(jsonPath("$.empresa.id").value(7))
                .andExpect(jsonPath("$.empresa.nome").value("Empresa Teste"))
                // Nunca deve vazar hash de senha
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("senha_hash"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("senhaHash"))));
    }

    @Test
    void meComTokenExpiradoDeveRetornar401() throws Exception {
        JwtService expirado = new JwtService(
                "segredo-de-teste-apenas-para-os-testes-do-erpell-1234567890", -1_000L);
        String token = expirado.gerarToken(criarUsuario(1L, "ADMIN"));

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void meComTokenAdulteradoDeveRetornar401() throws Exception {
        String token = jwtService.gerarToken(criarUsuario(1L, "ADMIN"));
        String adulterado = token.substring(0, token.length() - 3) + "aaa";

        mockMvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + adulterado))
                .andExpect(status().isUnauthorized());
    }

    private Usuario criarUsuario(Long id, String perfil) {
        Usuario usuario = org.mockito.Mockito.mock(Usuario.class);
        when(usuario.getId()).thenReturn(id);
        when(usuario.getPerfil()).thenReturn(perfil);
        when(usuario.getEmpresaId()).thenReturn(7L);
        return usuario;
    }

    private EmpresaResponse empresaFake() {
        Empresa empresa = new Empresa("Empresa Teste");
        return EmpresaResponse.de(setId(empresa, 7L));
    }

    private Empresa setId(Empresa empresa, Long id) {
        org.springframework.test.util.ReflectionTestUtils.setField(empresa, "id", id);
        return empresa;
    }
}
