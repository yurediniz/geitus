package com.upeflow.erpell.company;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.upeflow.erpell.auth.JwtAuthenticationFilter;
import com.upeflow.erpell.auth.JwtService;
import com.upeflow.erpell.company.dto.EmpresaResponse;
import com.upeflow.erpell.config.RestAccessDeniedHandler;
import com.upeflow.erpell.config.RestAuthenticationEntryPoint;
import com.upeflow.erpell.config.SecurityConfig;
import com.upeflow.erpell.shared.error.GlobalExceptionHandler;
import com.upeflow.erpell.user.Usuario;

/**
 * Testa o contrato HTTP dos endpoints de empresa do usuario autenticado
 * (rotas protegidas e regras de entrada), usando uma fatia web sem banco de
 * dados.
 *
 * <p>O {@link JwtService} e um bean real (para gerar tokens de teste); o
 * {@link EmpresaService} e mockado.
 */
@WebMvcTest(EmpresaController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtService.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class,
        GlobalExceptionHandler.class
})
class EmpresaControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private EmpresaService empresaService;

    @Test
    void minhaEmpresaSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(get("/api/empresas/minha"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void minhaEmpresaComTokenValidoDeveRetornar200ComEmpresaDoUsuario() throws Exception {
        EmpresaResponse empresa = new EmpresaResponse(
                7L, "Mercado do Ze", true, LocalDateTime.now(), null);
        when(empresaService.buscarEmpresaDoUsuario(1L)).thenReturn(empresa);

        String token = jwtService.gerarToken(criarUsuario(1L, "ADMIN"));

        mockMvc.perform(get("/api/empresas/minha").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.nome").value("Mercado do Ze"))
                .andExpect(jsonPath("$.ativo").value(true));
    }

    @Test
    void atualizarMinhaEmpresaSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(patch("/api/empresas/minha")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Novo Nome\" }"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void atualizarMinhaEmpresaComNomeEmBrancoDeveRetornar400() throws Exception {
        String token = jwtService.gerarToken(criarUsuario(1L, "ADMIN"));

        mockMvc.perform(patch("/api/empresas/minha")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"   \" }"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.campos").isArray());
    }

    @Test
    void atualizarMinhaEmpresaComNomeVazioDeveRetornar400() throws Exception {
        String token = jwtService.gerarToken(criarUsuario(1L, "ADMIN"));

        mockMvc.perform(patch("/api/empresas/minha")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"\" }"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void atualizarMinhaEmpresaComNomeValidoDeveRetornar200EAtualizarApenasAEmpresaDoUsuarioAutenticado()
            throws Exception {
        EmpresaResponse atualizada = new EmpresaResponse(
                7L, "Novo Nome", true, LocalDateTime.now(), LocalDateTime.now());
        when(empresaService.atualizarNomeDaEmpresa(eq(1L), eq("Novo Nome"))).thenReturn(atualizada);

        String token = jwtService.gerarToken(criarUsuario(1L, "ADMIN"));

        mockMvc.perform(patch("/api/empresas/minha")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Novo Nome\" }"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.nome").value("Novo Nome"));

        // Nao existe parametro de empresaId em lugar algum do endpoint: a empresa
        // atualizada e sempre derivada do id do usuario extraido do token (1L),
        // nunca de um valor informado pelo cliente. Verifica que o service foi
        // chamado exatamente com o id do usuario autenticado.
        org.mockito.Mockito.verify(empresaService).atualizarNomeDaEmpresa(eq(1L), eq("Novo Nome"));
        org.mockito.Mockito.verifyNoMoreInteractions(empresaService);
    }

    private Usuario criarUsuario(Long id, String perfil) {
        Usuario usuario = org.mockito.Mockito.mock(Usuario.class);
        when(usuario.getId()).thenReturn(id);
        when(usuario.getPerfil()).thenReturn(perfil);
        when(usuario.getEmpresaId()).thenReturn(7L);
        return usuario;
    }
}
