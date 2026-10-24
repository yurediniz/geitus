package com.geitus.app.supplier;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
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
import java.util.Collections;
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

import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.config.RestAccessDeniedHandler;
import com.geitus.app.config.RestAuthenticationEntryPoint;
import com.geitus.app.config.SecurityConfig;
import com.geitus.app.iam.JwtAuthenticationFilter;
import com.geitus.app.iam.JwtService;
import com.geitus.app.iam.Usuario;
import com.geitus.app.shared.error.GlobalExceptionHandler;
import com.geitus.app.supplier.dto.FornecedorItemResponse;
import com.geitus.app.supplier.dto.FornecedorRequest;
import com.geitus.app.supplier.dto.FornecedorResponse;
import com.geitus.app.supplier.dto.RepresentantePrincipalResponse;

/**
 * Contrato HTTP de {@code /api/fornecedores} (docs/modules/fornecedores-e-marcas.md,
 * 4.7): autenticacao, RBAC (leitura para qualquer autenticado; escrita so
 * ADMIN, qualquer metodo), limites do Bean Validation, mapeamento dos erros do
 * dominio (400/404/409 com o campo) e ausencia de dados internos. Fatia web
 * sem banco.
 */
@WebMvcTest(FornecedorController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtService.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class,
        GlobalExceptionHandler.class
})
class FornecedorControllerTest {

    private static final Long ID_ADMIN = 1L;
    private static final Long ID_OPERADOR = 2L;
    private static final Long ID_EMPRESA = 7L;
    private static final String CORPO_VALIDO = """
            { "razaoSocial": "Distribuidora Central" }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private FornecedorService fornecedorService;

    // ---------- Autenticacao e RBAC ----------

    @Test
    void semTokenRetorna401() throws Exception {
        mockMvc.perform(get("/api/fornecedores")).andExpect(status().isUnauthorized());
        mockMvc.perform(comCorpo(post("/api/fornecedores"), CORPO_VALIDO)).andExpect(status().isUnauthorized());

        verifyNoInteractions(fornecedorService);
    }

    @Test
    void operadorListaEConsultaSemDadosInternos() throws Exception {
        UUID id = UUID.randomUUID();
        when(fornecedorService.listarParaUsuario(ID_OPERADOR, "central", null, 0, 25))
                .thenReturn(new PaginaResponse<>(List.of(item(id)), 0, 25, 1));
        when(fornecedorService.buscarParaUsuario(ID_OPERADOR, id)).thenReturn(resposta(id));

        mockMvc.perform(comoOperador(get("/api/fornecedores").param("busca", "central")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens[0].id").value(id.toString()))
                .andExpect(jsonPath("$.itens[0].numero").value(4))
                .andExpect(jsonPath("$.itens[0].representantePrincipal.nome").value("Ana"))
                .andExpect(jsonPath("$.itens[0].quantidadeProdutos").value(3))
                .andExpect(jsonPath("$.itens[0].empresaId").doesNotExist())
                .andExpect(jsonPath("$.totalItens").value(1));
        mockMvc.perform(comoOperador(get("/api/fornecedores/" + id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.razaoSocial").value("Distribuidora Central"))
                .andExpect(jsonPath("$.buscaNormalizada").doesNotExist());
    }

    @Test
    void operadorNaoEscreveComNenhumMetodo() throws Exception {
        String item = "/api/fornecedores/" + UUID.randomUUID();
        mockMvc.perform(comoOperador(comCorpo(post("/api/fornecedores"), CORPO_VALIDO)))
                .andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(comCorpo(patch(item), CORPO_VALIDO))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(comCorpo(put(item), CORPO_VALIDO))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(delete(item))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(patch(item + "/inativar"))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(patch(item + "/reativar"))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(comCorpo(post(item + "/produtos"), "{}"))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(delete(item + "/produtos/" + UUID.randomUUID())))
                .andExpect(status().isForbidden());

        verifyNoInteractions(fornecedorService);
    }

    @Test
    void adminCadastraEditaInativaEExclui() throws Exception {
        UUID id = UUID.randomUUID();
        when(fornecedorService.cadastrarParaUsuario(eq(ID_ADMIN), any(FornecedorRequest.class)))
                .thenReturn(resposta(id));
        when(fornecedorService.atualizarParaUsuario(eq(ID_ADMIN), eq(id), any(FornecedorRequest.class)))
                .thenReturn(resposta(id));
        when(fornecedorService.inativarParaUsuario(ID_ADMIN, id)).thenReturn(resposta(id));

        mockMvc.perform(comoAdmin(comCorpo(post("/api/fornecedores"), CORPO_VALIDO)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(id.toString()));
        mockMvc.perform(comoAdmin(comCorpo(patch("/api/fornecedores/" + id), CORPO_VALIDO)))
                .andExpect(status().isOk());
        mockMvc.perform(comoAdmin(patch("/api/fornecedores/" + id + "/inativar"))).andExpect(status().isOk());
        mockMvc.perform(comoAdmin(delete("/api/fornecedores/" + id))).andExpect(status().isNoContent());
    }

    // ---------- Validacao e erros ----------

    @Test
    void maisDeDezRepresentantesRetorna400NoCampoDaLista() throws Exception {
        String representantes = String.join(",", Collections.nCopies(11, "{ \"nome\": \"Ana\" }"));

        mockMvc.perform(comoAdmin(comCorpo(post("/api/fornecedores"),
                "{ \"razaoSocial\": \"X\", \"representantes\": [" + representantes + "] }")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("representantes"))
                .andExpect(jsonPath("$.campos[0].mensagem").value("Informe no máximo 10 representantes."));
        verifyNoInteractions(fornecedorService);
    }

    @Test
    void regraDoCadastroRetorna400ComOCampo() throws Exception {
        when(fornecedorService.cadastrarParaUsuario(eq(ID_ADMIN), any(FornecedorRequest.class)))
                .thenThrow(new DadosFornecedorInvalidosException("Inscrição estadual só para pessoa jurídica.",
                        "inscricaoEstadual"));

        mockMvc.perform(comoAdmin(comCorpo(post("/api/fornecedores"), CORPO_VALIDO)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Inscrição estadual só para pessoa jurídica."))
                .andExpect(jsonPath("$.campos[0].campo").value("inscricaoEstadual"));
    }

    @Test
    void documentoRepetidoRetorna409ComOCampo() throws Exception {
        when(fornecedorService.cadastrarParaUsuario(eq(ID_ADMIN), any(FornecedorRequest.class)))
                .thenThrow(new FornecedorConflitoException("Já existe o fornecedor Atacado Sul com este CNPJ.",
                        "documento"));

        mockMvc.perform(comoAdmin(comCorpo(post("/api/fornecedores"), CORPO_VALIDO)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Já existe o fornecedor Atacado Sul com este CNPJ."))
                .andExpect(jsonPath("$.campos[0].campo").value("documento"));
    }

    @Test
    void exclusaoComVinculosRetorna409() throws Exception {
        UUID id = UUID.randomUUID();
        String mensagem = "Não é possível excluir: o fornecedor tem 1 produto(s) ligados e 0 entrada(s) registradas."
                + " Inative-o.";
        doThrow(new FornecedorConflitoException(mensagem)).when(fornecedorService).excluirParaUsuario(ID_ADMIN, id);

        mockMvc.perform(comoAdmin(delete("/api/fornecedores/" + id)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(mensagem));
    }

    @Test
    void fornecedorNaoEncontradoRetorna404EUuidMalformado400() throws Exception {
        UUID id = UUID.randomUUID();
        when(fornecedorService.buscarParaUsuario(ID_ADMIN, id)).thenThrow(new FornecedorNaoEncontradoException());

        mockMvc.perform(comoAdmin(get("/api/fornecedores/" + id)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Fornecedor não encontrado."));
        mockMvc.perform(comoAdmin(get("/api/fornecedores/abc"))).andExpect(status().isBadRequest());
    }

    @Test
    void tipoDePessoaDesconhecidoRetorna400() throws Exception {
        mockMvc.perform(comoAdmin(comCorpo(post("/api/fornecedores"),
                "{ \"razaoSocial\": \"X\", \"tipoPessoa\": \"PX\" }")))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(fornecedorService);
    }

    // ---------- Apoio ----------

    private static FornecedorItemResponse item(UUID id) {
        return new FornecedorItemResponse(id, 4L, "Distribuidora Central", "Central", TipoPessoaFornecedor.PJ,
                "11222333000181", "1133224455", new RepresentantePrincipalResponse("Ana", "11987654321"), 3L, true);
    }

    private static FornecedorResponse resposta(UUID id) {
        return new FornecedorResponse(id, 4L, TipoPessoaFornecedor.PJ, null, "Distribuidora Central", null, null,
                null, null, null, null, null, null, null, null, null, null, List.of(), List.of(), 0L, true,
                LocalDateTime.of(2026, 10, 24, 10, 0), null);
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
}
