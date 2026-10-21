package com.geitus.app.catalog.unidade;

import static org.hamcrest.Matchers.hasItem;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.geitus.app.catalog.CatalogoConflitoException;
import com.geitus.app.catalog.CatalogoNaoEncontradoException;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaRequest;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;
import com.geitus.app.config.RestAccessDeniedHandler;
import com.geitus.app.config.RestAuthenticationEntryPoint;
import com.geitus.app.config.SecurityConfig;
import com.geitus.app.iam.JwtAuthenticationFilter;
import com.geitus.app.iam.JwtService;
import com.geitus.app.iam.Usuario;
import com.geitus.app.shared.error.GlobalExceptionHandler;

/**
 * Testa o contrato HTTP de {@code /api/unidades}: autenticacao, RBAC da
 * DEC-031 (leitura para qualquer autenticado; escrita so ADMIN, qualquer
 * metodo), UUID publico, mapeamento de erros (400/404/409) e ausencia de dados
 * internos na resposta. Fatia web sem banco: o service e mockado.
 */
@WebMvcTest(UnidadeMedidaController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtService.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class,
        GlobalExceptionHandler.class
})
class UnidadeMedidaControllerTest {

    private static final Long ID_ADMIN = 1L;
    private static final Long ID_OPERADOR = 2L;
    private static final Long ID_EMPRESA = 7L;
    private static final String CORPO_VALIDO = """
            { "sigla": "kg", "descricao": "Quilograma", "fracionada": true }
            """;
    private static final UnidadeMedidaRequest REQUEST_DO_CORPO_VALIDO =
            new UnidadeMedidaRequest("kg", "Quilograma", true);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private UnidadeMedidaService unidadeService;

    private static UnidadeMedidaResponse resposta(UUID id) {
        return new UnidadeMedidaResponse(id, "KG", "Quilograma", true, true, 0L,
                LocalDateTime.of(2026, 10, 20, 10, 0), null);
    }

    private String token(Long idUsuario, String perfil) {
        Usuario usuario = Mockito.mock(Usuario.class);
        when(usuario.getId()).thenReturn(idUsuario);
        when(usuario.getPerfil()).thenReturn(perfil);
        when(usuario.getEmpresaId()).thenReturn(ID_EMPRESA);
        return jwtService.gerarToken(usuario);
    }

    private MockHttpServletRequestBuilder comoAdmin(MockHttpServletRequestBuilder requisicao) {
        return requisicao.header("Authorization", "Bearer " + token(ID_ADMIN, "ADMIN"));
    }

    private MockHttpServletRequestBuilder comoOperador(MockHttpServletRequestBuilder requisicao) {
        return requisicao.header("Authorization", "Bearer " + token(ID_OPERADOR, "OPERADOR"));
    }

    private static MockHttpServletRequestBuilder comCorpo(MockHttpServletRequestBuilder requisicao, String corpo) {
        return requisicao.contentType(MediaType.APPLICATION_JSON).content(corpo);
    }

    // ---------- Autenticacao ----------

    @Test
    void listarSemTokenRetorna401() throws Exception {
        mockMvc.perform(get("/api/unidades")).andExpect(status().isUnauthorized());

        verifyNoInteractions(unidadeService);
    }

    @Test
    void cadastrarSemTokenRetorna401() throws Exception {
        mockMvc.perform(comCorpo(post("/api/unidades"), CORPO_VALIDO)).andExpect(status().isUnauthorized());

        verifyNoInteractions(unidadeService);
    }

    // ---------- RBAC (DEC-031) ----------

    @Test
    void operadorListaRetorna200SemDadosInternos() throws Exception {
        UUID id = UUID.randomUUID();
        when(unidadeService.listarParaUsuario(ID_OPERADOR, true)).thenReturn(List.of(resposta(id)));

        mockMvc.perform(comoOperador(get("/api/unidades").param("ativo", "true")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id.toString()))
                .andExpect(jsonPath("$[0].sigla").value("KG"))
                .andExpect(jsonPath("$[0].fracionada").value(true))
                .andExpect(jsonPath("$[0].emUso").value(0))
                .andExpect(jsonPath("$[0].empresaId").doesNotExist())
                .andExpect(jsonPath("$[0].empresa").doesNotExist());
    }

    @Test
    void operadorNaoCadastra() throws Exception {
        mockMvc.perform(comoOperador(comCorpo(post("/api/unidades"), CORPO_VALIDO)))
                .andExpect(status().isForbidden());

        verifyNoInteractions(unidadeService);
    }

    @Test
    void operadorNaoEdita() throws Exception {
        mockMvc.perform(comoOperador(comCorpo(patch("/api/unidades/" + UUID.randomUUID()), CORPO_VALIDO)))
                .andExpect(status().isForbidden());

        verifyNoInteractions(unidadeService);
    }

    @Test
    void operadorNaoExclui() throws Exception {
        mockMvc.perform(comoOperador(delete("/api/unidades/" + UUID.randomUUID())))
                .andExpect(status().isForbidden());

        verifyNoInteractions(unidadeService);
    }

    @Test
    void operadorNaoInativaNemReativaComQualquerMetodo() throws Exception {
        String base = "/api/unidades/" + UUID.randomUUID();
        mockMvc.perform(comoOperador(patch(base + "/inativar"))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(post(base + "/inativar"))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(delete(base + "/inativar"))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(patch(base + "/reativar"))).andExpect(status().isForbidden());

        verifyNoInteractions(unidadeService);
    }

    // ---------- ADMIN ----------

    @Test
    void adminCadastraRetorna201() throws Exception {
        UUID id = UUID.randomUUID();
        when(unidadeService.cadastrarParaUsuario(ID_ADMIN, REQUEST_DO_CORPO_VALIDO)).thenReturn(resposta(id));

        mockMvc.perform(comoAdmin(comCorpo(post("/api/unidades"), CORPO_VALIDO)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.sigla").value("KG"));
    }

    @Test
    void adminEditaRetorna200() throws Exception {
        UUID id = UUID.randomUUID();
        when(unidadeService.atualizarParaUsuario(ID_ADMIN, id, REQUEST_DO_CORPO_VALIDO)).thenReturn(resposta(id));

        mockMvc.perform(comoAdmin(comCorpo(patch("/api/unidades/" + id), CORPO_VALIDO)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()));
    }

    @Test
    void adminInativaEReativaRetorna200() throws Exception {
        UUID id = UUID.randomUUID();
        when(unidadeService.inativarParaUsuario(ID_ADMIN, id)).thenReturn(resposta(id));
        when(unidadeService.reativarParaUsuario(ID_ADMIN, id)).thenReturn(resposta(id));

        mockMvc.perform(comoAdmin(patch("/api/unidades/" + id + "/inativar"))).andExpect(status().isOk());
        mockMvc.perform(comoAdmin(patch("/api/unidades/" + id + "/reativar"))).andExpect(status().isOk());
    }

    @Test
    void adminExcluiRetorna204() throws Exception {
        UUID id = UUID.randomUUID();

        mockMvc.perform(comoAdmin(delete("/api/unidades/" + id))).andExpect(status().isNoContent());

        verify(unidadeService).excluirParaUsuario(ID_ADMIN, id);
    }

    // ---------- Erros ----------

    @Test
    void unidadeEmUsoRetorna409ComMensagem() throws Exception {
        UUID id = UUID.randomUUID();
        String mensagem = "Esta unidade está em uso por 2 produto(s). "
                + "Inative-a para que não apareça em novos cadastros.";
        doThrow(new CatalogoConflitoException(mensagem)).when(unidadeService).excluirParaUsuario(ID_ADMIN, id);

        mockMvc.perform(comoAdmin(delete("/api/unidades/" + id)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(mensagem));
    }

    @Test
    void unidadeNaoEncontradaRetorna404() throws Exception {
        UUID id = UUID.randomUUID();
        when(unidadeService.inativarParaUsuario(ID_ADMIN, id))
                .thenThrow(new CatalogoNaoEncontradoException("Unidade de medida não encontrada."));

        mockMvc.perform(comoAdmin(patch("/api/unidades/" + id + "/inativar")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Unidade de medida não encontrada."));
    }

    @Test
    void siglaEmBrancoRetorna400() throws Exception {
        mockMvc.perform(comoAdmin(comCorpo(post("/api/unidades"), """
                { "sigla": "  ", "descricao": "Quilograma", "fracionada": true }
                """)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[*].campo").value(hasItem("sigla")));

        verifyNoInteractions(unidadeService);
    }

    @Test
    void siglaLongaEDescricaoLongaRetornam400() throws Exception {
        String corpo = "{ \"sigla\": \"" + "A".repeat(21) + "\", \"descricao\": \"" + "d".repeat(61)
                + "\", \"fracionada\": false }";

        mockMvc.perform(comoAdmin(comCorpo(post("/api/unidades"), corpo)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[*].campo").value(hasItem("sigla")))
                .andExpect(jsonPath("$.campos[*].campo").value(hasItem("descricao")));
    }

    @Test
    void uuidMalformadoRetorna400() throws Exception {
        mockMvc.perform(comoAdmin(delete("/api/unidades/abc")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Identificador inválido."));

        verifyNoInteractions(unidadeService);
    }

    @Test
    void idNumericoNaRotaNaoEAceito() throws Exception {
        mockMvc.perform(comoAdmin(comCorpo(patch("/api/unidades/42"), CORPO_VALIDO)))
                .andExpect(status().isBadRequest());

        verify(unidadeService, Mockito.never()).atualizarParaUsuario(eq(ID_ADMIN), any(), any());
    }
}
