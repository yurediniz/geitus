package com.geitus.app.iam;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import com.geitus.app.company.Empresa;
import com.geitus.app.company.dto.EmpresaResponse;
import com.geitus.app.config.RestAccessDeniedHandler;
import com.geitus.app.config.RestAuthenticationEntryPoint;
import com.geitus.app.config.SecurityConfig;
import com.geitus.app.iam.dto.UsuarioResponse;
import com.geitus.app.shared.error.GlobalExceptionHandler;

/**
 * Testa o contrato HTTP dos endpoints de gestao de usuarios e o RBAC basico
 * (ADMIN gerencia; OPERADOR recebe 403; troca da propria senha liberada a
 * autenticados), usando uma fatia web sem banco.
 *
 * <p>{@link JwtService} e bean real (gera tokens de teste); {@link UsuarioService}
 * e mockado.
 */
@WebMvcTest(UsuarioController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtService.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class,
        GlobalExceptionHandler.class
})
class UsuarioControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private UsuarioService usuarioService;

    private String token(Long idUsuario, String perfil) {
        Usuario usuario = org.mockito.Mockito.mock(Usuario.class);
        when(usuario.getId()).thenReturn(idUsuario);
        when(usuario.getPerfil()).thenReturn(perfil);
        when(usuario.getEmpresaId()).thenReturn(7L);
        return jwtService.gerarToken(usuario);
    }

    private UsuarioResponse respostaFake(Long id, String nome, String perfil, boolean ativo) {
        Empresa empresa = new Empresa("Empresa Teste");
        ReflectionTestUtils.setField(empresa, "id", 7L);
        return new UsuarioResponse(id, nome, "user" + id + "@x.com", perfil, ativo, null, null,
                EmpresaResponse.de(empresa));
    }

    // ---------- Autenticacao ----------

    @Test
    void listarSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(get("/api/usuarios"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void alterarPropriaSenhaSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(patch("/api/usuarios/me/senha")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"senhaAtual\": \"senhaAtual1\", \"novaSenha\": \"senhaNova12345\" }"))
                .andExpect(status().isUnauthorized());
    }

    // ---------- RBAC ----------

    @Test
    void listarComOperadorDeveRetornar403() throws Exception {
        mockMvc.perform(get("/api/usuarios").header("Authorization", "Bearer " + token(2L, "OPERADOR")))
                .andExpect(status().isForbidden());
    }

    @Test
    void criarComOperadorDeveRetornar403() throws Exception {
        mockMvc.perform(post("/api/usuarios")
                        .header("Authorization", "Bearer " + token(2L, "OPERADOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"X\", \"email\": \"x@x.com\", \"senha\": \"senhaForte1\", "
                                + "\"perfil\": \"OPERADOR\" }"))
                .andExpect(status().isForbidden());
    }

    @Test
    void redefinirSenhaComOperadorDeveRetornar403() throws Exception {
        mockMvc.perform(patch("/api/usuarios/5/senha")
                        .header("Authorization", "Bearer " + token(2L, "OPERADOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"novaSenha\": \"senhaNova12345\" }"))
                .andExpect(status().isForbidden());
    }

    // ---------- Listagem ----------

    @Test
    void listarComAdminDeveRetornar200() throws Exception {
        when(usuarioService.listarParaUsuario(eq(1L), eq(null), eq(null), eq(null)))
                .thenReturn(List.of(respostaFake(1L, "Admin", "ADMIN", true)));

        mockMvc.perform(get("/api/usuarios").header("Authorization", "Bearer " + token(1L, "ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].perfil").value("ADMIN"))
                // Nunca deve vazar hash de senha
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("senha_hash"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("senhaHash"))));
    }

    @Test
    void listarComFiltrosDeveRepassarParametros() throws Exception {
        when(usuarioService.listarParaUsuario(eq(1L), eq("maria"), eq(true), eq("OPERADOR")))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/usuarios")
                        .param("busca", "maria").param("ativo", "true").param("perfil", "OPERADOR")
                        .header("Authorization", "Bearer " + token(1L, "ADMIN")))
                .andExpect(status().isOk());

        org.mockito.Mockito.verify(usuarioService).listarParaUsuario(eq(1L), eq("maria"), eq(true), eq("OPERADOR"));
    }

    // ---------- Busca por id ----------

    @Test
    void buscarPorIdDeOutraEmpresaDeveRetornar404() throws Exception {
        when(usuarioService.buscarParaUsuario(1L, 99L)).thenThrow(new UsuarioNaoEncontradoException());

        mockMvc.perform(get("/api/usuarios/99").header("Authorization", "Bearer " + token(1L, "ADMIN")))
                .andExpect(status().isNotFound());
    }

    // ---------- Criar ----------

    @Test
    void criarValidoComAdminDeveRetornar201() throws Exception {
        when(usuarioService.criarParaUsuario(eq(1L), any()))
                .thenReturn(respostaFake(10L, "Nova", "OPERADOR", true));

        mockMvc.perform(post("/api/usuarios")
                        .header("Authorization", "Bearer " + token(1L, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Nova\", \"email\": \"nova@x.com\", \"senha\": \"senhaForte1\", "
                                + "\"perfil\": \"OPERADOR\" }"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(10));
    }

    @Test
    void criarComEmailDuplicadoDeveRetornar409() throws Exception {
        when(usuarioService.criarParaUsuario(eq(1L), any()))
                .thenThrow(new ConflitoDeUsuarioException("Já existe um usuário com este e-mail."));

        mockMvc.perform(post("/api/usuarios")
                        .header("Authorization", "Bearer " + token(1L, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Nova\", \"email\": \"dup@x.com\", \"senha\": \"senhaForte1\", "
                                + "\"perfil\": \"OPERADOR\" }"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    void criarComPerfilInvalidoDeveRetornar400() throws Exception {
        when(usuarioService.criarParaUsuario(eq(1L), any()))
                .thenThrow(new DadosUsuarioInvalidosException("Perfil inválido: use ADMIN ou OPERADOR."));

        mockMvc.perform(post("/api/usuarios")
                        .header("Authorization", "Bearer " + token(1L, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Nova\", \"email\": \"nova@x.com\", \"senha\": \"senhaForte1\", "
                                + "\"perfil\": \"GERENTE\" }"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void criarComSenhaCurtaDeveRetornar400() throws Exception {
        mockMvc.perform(post("/api/usuarios")
                        .header("Authorization", "Bearer " + token(1L, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Nova\", \"email\": \"nova@x.com\", \"senha\": \"curta12\", "
                                + "\"perfil\": \"OPERADOR\" }"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos").isArray());
    }

    @Test
    void criarComCamposVaziosDeveRetornar400() throws Exception {
        mockMvc.perform(post("/api/usuarios")
                        .header("Authorization", "Bearer " + token(1L, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"\", \"email\": \"\", \"senha\": \"\", \"perfil\": \"\" }"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos").isArray());
    }

    // ---------- Atualizar ----------

    @Test
    void atualizarComAdminDeveRetornar200() throws Exception {
        when(usuarioService.atualizarParaUsuario(eq(1L), eq(5L), any()))
                .thenReturn(respostaFake(5L, "Nome Novo", "ADMIN", true));

        mockMvc.perform(patch("/api/usuarios/5")
                        .header("Authorization", "Bearer " + token(1L, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Nome Novo\", \"perfil\": \"ADMIN\" }"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nome").value("Nome Novo"));
    }

    @Test
    void atualizarRebaixandoUltimoAdminDeveRetornar409() throws Exception {
        when(usuarioService.atualizarParaUsuario(eq(1L), eq(5L), any()))
                .thenThrow(new ConflitoDeUsuarioException("A empresa precisa de ao menos um administrador ativo."));

        mockMvc.perform(patch("/api/usuarios/5")
                        .header("Authorization", "Bearer " + token(1L, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Ainda Admin\", \"perfil\": \"OPERADOR\" }"))
                .andExpect(status().isConflict());
    }

    // ---------- Inativar / reativar ----------

    @Test
    void inativarComAdminDeveRetornar200() throws Exception {
        when(usuarioService.inativarParaUsuario(1L, 5L)).thenReturn(respostaFake(5L, "Alguem", "OPERADOR", false));

        mockMvc.perform(patch("/api/usuarios/5/inativar").header("Authorization", "Bearer " + token(1L, "ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(false));
    }

    @Test
    void inativarUltimoAdminDeveRetornar409() throws Exception {
        when(usuarioService.inativarParaUsuario(1L, 5L))
                .thenThrow(new ConflitoDeUsuarioException("A empresa precisa de ao menos um administrador ativo."));

        mockMvc.perform(patch("/api/usuarios/5/inativar").header("Authorization", "Bearer " + token(1L, "ADMIN")))
                .andExpect(status().isConflict());
    }

    @Test
    void reativarComAdminDeveRetornar200() throws Exception {
        when(usuarioService.reativarParaUsuario(1L, 5L)).thenReturn(respostaFake(5L, "Alguem", "OPERADOR", true));

        mockMvc.perform(patch("/api/usuarios/5/reativar").header("Authorization", "Bearer " + token(1L, "ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(true));
    }

    // ---------- Redefinir senha (ADMIN) ----------

    @Test
    void redefinirSenhaComAdminDeveRetornar204() throws Exception {
        mockMvc.perform(patch("/api/usuarios/5/senha")
                        .header("Authorization", "Bearer " + token(1L, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"novaSenha\": \"senhaNova12345\" }"))
                .andExpect(status().isNoContent());
    }

    // ---------- Trocar a propria senha ----------

    @Test
    void alterarPropriaSenhaComOperadorAutenticadoDeveRetornar204() throws Exception {
        mockMvc.perform(patch("/api/usuarios/me/senha")
                        .header("Authorization", "Bearer " + token(2L, "OPERADOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"senhaAtual\": \"senhaAtual1\", \"novaSenha\": \"senhaNova12345\" }"))
                .andExpect(status().isNoContent());
    }

    @Test
    void alterarPropriaSenhaComSenhaAtualIncorretaDeveRetornar400() throws Exception {
        doThrow(new DadosUsuarioInvalidosException("Senha atual incorreta."))
                .when(usuarioService).alterarPropriaSenhaParaUsuario(eq(2L), any());

        mockMvc.perform(patch("/api/usuarios/me/senha")
                        .header("Authorization", "Bearer " + token(2L, "OPERADOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"senhaAtual\": \"errada\", \"novaSenha\": \"senhaNova12345\" }"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void alterarPropriaSenhaComNovaSenhaCurtaDeveRetornar400() throws Exception {
        mockMvc.perform(patch("/api/usuarios/me/senha")
                        .header("Authorization", "Bearer " + token(2L, "OPERADOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"senhaAtual\": \"senhaAtual1\", \"novaSenha\": \"curta12\" }"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos").isArray());
    }
}
