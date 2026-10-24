package com.geitus.app.catalog.marca;

import static org.hamcrest.Matchers.hasItem;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.marca.dto.MarcaRequest;
import com.geitus.app.catalog.marca.dto.MarcaResponse;
import com.geitus.app.config.RestAccessDeniedHandler;
import com.geitus.app.config.RestAuthenticationEntryPoint;
import com.geitus.app.config.SecurityConfig;
import com.geitus.app.iam.JwtAuthenticationFilter;
import com.geitus.app.iam.JwtService;
import com.geitus.app.iam.Usuario;
import com.geitus.app.shared.error.GlobalExceptionHandler;

/**
 * Testa o contrato HTTP de {@code /api/marcas}: autenticacao, RBAC da
 * DEC-039, como nas categorias (leitura para qualquer autenticado; escrita so ADMIN, qualquer
 * metodo), UUID publico (inclusive o {@code parentId}), mapeamento de erros
 * (400/404/409) e ausencia de dados internos na resposta. Fatia web sem banco.
 */
@WebMvcTest(MarcaController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtService.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class,
        GlobalExceptionHandler.class
})
class MarcaControllerTest {

    private static final Long ID_ADMIN = 1L;
    private static final Long ID_OPERADOR = 2L;
    private static final Long ID_EMPRESA = 7L;
    private static final UUID ID_PAI = UUID.fromString("7b0f4a9e-2c1d-4e5f-9a8b-1c2d3e4f5a6b");
    private static final String CORPO_VALIDO = """
            { "nome": "Úmida", "parentId": "7b0f4a9e-2c1d-4e5f-9a8b-1c2d3e4f5a6b" }
            """;
    private static final MarcaRequest REQUEST_DO_CORPO_VALIDO = new MarcaRequest("Úmida", ID_PAI);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private MarcaService marcaService;

    private static MarcaResponse resposta(UUID id) {
        return new MarcaResponse(id, "Úmida", ID_PAI, "Ração › Úmida", 1, true, true, 0, 3L, 2L,
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
        mockMvc.perform(get("/api/marcas")).andExpect(status().isUnauthorized());

        verifyNoInteractions(marcaService);
    }

    @Test
    void excluirSemTokenRetorna401() throws Exception {
        mockMvc.perform(delete("/api/marcas/" + UUID.randomUUID())).andExpect(status().isUnauthorized());

        verifyNoInteractions(marcaService);
    }

    // ---------- RBAC (DEC-039, como DEC-031) ----------

    @Test
    void operadorListaRetorna200SemDadosInternos() throws Exception {
        UUID id = UUID.randomUUID();
        when(marcaService.listarParaUsuario(ID_OPERADOR, null)).thenReturn(List.of(resposta(id)));

        mockMvc.perform(comoOperador(get("/api/marcas")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id.toString()))
                .andExpect(jsonPath("$[0].parentId").value(ID_PAI.toString()))
                .andExpect(jsonPath("$[0].caminho").value("Ração › Úmida"))
                .andExpect(jsonPath("$[0].nivel").value(1))
                .andExpect(jsonPath("$[0].selecionavel").value(true))
                .andExpect(jsonPath("$[0].quantidadeSubmarcas").value(0))
                .andExpect(jsonPath("$[0].quantidadeProdutos").value(3))
                .andExpect(jsonPath("$[0].quantidadeFornecedores").value(2))
                .andExpect(jsonPath("$[0].empresaId").doesNotExist())
                .andExpect(jsonPath("$[0].pai").doesNotExist());
    }

    @Test
    void operadorNaoCadastraNemEditaNemExclui() throws Exception {
        String item = "/api/marcas/" + UUID.randomUUID();
        mockMvc.perform(comoOperador(comCorpo(post("/api/marcas"), CORPO_VALIDO)))
                .andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(comCorpo(patch(item), CORPO_VALIDO))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(comCorpo(put(item), CORPO_VALIDO))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(delete(item))).andExpect(status().isForbidden());

        verifyNoInteractions(marcaService);
    }

    @Test
    void operadorNaoInativaNemReativaComQualquerMetodo() throws Exception {
        String base = "/api/marcas/" + UUID.randomUUID();
        mockMvc.perform(comoOperador(patch(base + "/inativar"))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(post(base + "/inativar"))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(patch(base + "/reativar"))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(delete(base + "/reativar"))).andExpect(status().isForbidden());

        verifyNoInteractions(marcaService);
    }

    // ---------- ADMIN ----------

    @Test
    void adminCadastraRetorna201() throws Exception {
        UUID id = UUID.randomUUID();
        when(marcaService.cadastrarParaUsuario(ID_ADMIN, REQUEST_DO_CORPO_VALIDO)).thenReturn(resposta(id));

        mockMvc.perform(comoAdmin(comCorpo(post("/api/marcas"), CORPO_VALIDO)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.caminho").value("Ração › Úmida"));
    }

    @Test
    void adminMoveParaRaizComParentIdNulo() throws Exception {
        UUID id = UUID.randomUUID();
        when(marcaService.atualizarParaUsuario(ID_ADMIN, id, new MarcaRequest("Úmida", null)))
                .thenReturn(resposta(id));

        mockMvc.perform(comoAdmin(comCorpo(patch("/api/marcas/" + id), """
                { "nome": "Úmida", "parentId": null }
                """)))
                .andExpect(status().isOk());
    }

    @Test
    void adminInativaEReativaRetorna200() throws Exception {
        UUID id = UUID.randomUUID();
        when(marcaService.inativarParaUsuario(ID_ADMIN, id)).thenReturn(resposta(id));
        when(marcaService.reativarParaUsuario(ID_ADMIN, id)).thenReturn(resposta(id));

        mockMvc.perform(comoAdmin(patch("/api/marcas/" + id + "/inativar"))).andExpect(status().isOk());
        mockMvc.perform(comoAdmin(patch("/api/marcas/" + id + "/reativar"))).andExpect(status().isOk());
    }

    @Test
    void adminExcluiRetorna204() throws Exception {
        UUID id = UUID.randomUUID();

        mockMvc.perform(comoAdmin(delete("/api/marcas/" + id))).andExpect(status().isNoContent());

        verify(marcaService).excluirParaUsuario(ID_ADMIN, id);
    }

    // ---------- Erros ----------

    @Test
    void cicloRetorna400ComMensagem() throws Exception {
        UUID id = UUID.randomUUID();
        String mensagem = "Uma marca não pode ficar dentro dela mesma ou de uma submarca sua.";
        when(marcaService.atualizarParaUsuario(ID_ADMIN, id, REQUEST_DO_CORPO_VALIDO))
                .thenThrow(new RegraDeNegocioException(mensagem));

        mockMvc.perform(comoAdmin(comCorpo(patch("/api/marcas/" + id), CORPO_VALIDO)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value(mensagem));
    }

    @Test
    void exclusaoComVinculosRetorna409ComMensagem() throws Exception {
        UUID id = UUID.randomUUID();
        String mensagem = "Não é possível excluir: há 2 submarca(s) e 5 produto(s) nesta marca. "
                + "Mova-os ou inative a marca.";
        doThrow(new CatalogoConflitoException(mensagem)).when(marcaService).excluirParaUsuario(ID_ADMIN, id);

        mockMvc.perform(comoAdmin(delete("/api/marcas/" + id)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(mensagem));
    }

    @Test
    void paiNaoEncontradoRetorna404() throws Exception {
        when(marcaService.cadastrarParaUsuario(ID_ADMIN, REQUEST_DO_CORPO_VALIDO))
                .thenThrow(new CatalogoNaoEncontradoException("Marca pai não encontrada."));

        mockMvc.perform(comoAdmin(comCorpo(post("/api/marcas"), CORPO_VALIDO)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Marca pai não encontrada."));
    }

    @Test
    void nomeEmBrancoRetorna400() throws Exception {
        mockMvc.perform(comoAdmin(comCorpo(post("/api/marcas"), "{ \"nome\": \" \" }")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[*].campo").value(hasItem("nome")));

        verifyNoInteractions(marcaService);
    }

    @Test
    void nomeComMaisDe100CaracteresRetorna400() throws Exception {
        mockMvc.perform(comoAdmin(comCorpo(post("/api/marcas"),
                "{ \"nome\": \"" + "a".repeat(101) + "\" }")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[*].campo").value(hasItem("nome")));
    }

    @Test
    void parentIdMalformadoRetorna400() throws Exception {
        mockMvc.perform(comoAdmin(comCorpo(post("/api/marcas"), """
                { "nome": "Úmida", "parentId": "12" }
                """)))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(marcaService);
    }

    @Test
    void uuidMalformadoNaRotaRetorna400() throws Exception {
        mockMvc.perform(comoAdmin(patch("/api/marcas/abc/inativar")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Identificador inválido."));

        verifyNoInteractions(marcaService);
    }
}
