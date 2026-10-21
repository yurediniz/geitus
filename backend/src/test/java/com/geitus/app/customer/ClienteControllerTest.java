package com.geitus.app.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.geitus.app.company.Empresa;
import com.geitus.app.config.RestAccessDeniedHandler;
import com.geitus.app.config.RestAuthenticationEntryPoint;
import com.geitus.app.config.SecurityConfig;
import com.geitus.app.iam.JwtAuthenticationFilter;
import com.geitus.app.iam.JwtService;
import com.geitus.app.iam.Usuario;
import com.geitus.app.shared.error.GlobalExceptionHandler;

/**
 * Testa o contrato HTTP de {@code /api/clientes}: autenticacao, RBAC da
 * DEC-029 (cadastrar/editar para qualquer autenticado; inativar/reativar so
 * ADMIN, independente do metodo HTTP), UUID publico na rota e na resposta,
 * mapeamento de erros (400/404/409), campos internos do corpo ignorados
 * ({@code ativo}, {@code empresaId}, {@code id}) e ausencia de dados internos
 * na resposta.
 *
 * <p>Fatia web sem banco: o {@link JwtService} e real (gera os tokens de teste)
 * e o {@link ClienteService} e mockado. As queries sao exercidas contra
 * PostgreSQL real no {@link ClienteRepositoryIT}.
 */
@WebMvcTest(ClienteController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtService.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class,
        GlobalExceptionHandler.class
})
class ClienteControllerTest {

    private static final Long ID_ADMIN = 1L;
    private static final Long ID_OPERADOR = 2L;
    private static final Long ID_EMPRESA = 7L;
    private static final String TELEFONE = "11987654321";
    private static final String CORPO_VALIDO = """
            { "nome": "Ana", "cpf": "111.444.777-35", "telefone": "(11) 98765-4321" }
            """;
    private static final DadosCliente DADOS_DO_CORPO_VALIDO =
            new DadosCliente("Ana", "111.444.777-35", "(11) 98765-4321", null, null, null);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private ClienteService clienteService;

    // ---------- Helpers ----------

    private Cliente cliente(String nome) {
        Empresa empresa = new Empresa("Empresa " + ID_EMPRESA);
        ReflectionTestUtils.setField(empresa, "id", ID_EMPRESA);
        Cliente cliente = new Cliente(empresa, nome, "11144477735", TELEFONE, true, null, null);
        ReflectionTestUtils.setField(cliente, "id", 42L);
        return cliente;
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

    private MockHttpServletRequestBuilder comCorpo(MockHttpServletRequestBuilder requisicao, String corpo) {
        return requisicao.contentType(MediaType.APPLICATION_JSON).content(corpo);
    }

    // ---------- Autenticacao ----------

    @Test
    void listarSemTokenRetorna401() throws Exception {
        mockMvc.perform(get("/api/clientes"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(clienteService);
    }

    @Test
    void cadastrarSemTokenRetorna401() throws Exception {
        mockMvc.perform(comCorpo(post("/api/clientes"), CORPO_VALIDO))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(clienteService);
    }

    @Test
    void inativarSemTokenRetorna401() throws Exception {
        mockMvc.perform(patch("/api/clientes/" + UUID.randomUUID() + "/inativar"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(clienteService);
    }

    // ---------- Listagem ----------

    @Test
    void operadorListaComBuscaEStatusRepassadosAoService() throws Exception {
        Cliente ana = cliente("Ana");
        when(clienteService.listarParaUsuario(ID_OPERADOR, "(11) 98765", true)).thenReturn(List.of(ana));

        mockMvc.perform(comoOperador(get("/api/clientes").param("busca", "(11) 98765").param("ativo", "true")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(ana.getUuid().toString()))
                .andExpect(jsonPath("$[0].nome").value("Ana"));
    }

    @Test
    void buscaComMaisDe100CaracteresRetorna400() throws Exception {
        mockMvc.perform(comoOperador(get("/api/clientes").param("busca", "a".repeat(101))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[*].mensagem")
                        .value(hasItem("Busca deve ter no máximo 100 caracteres.")));

        verifyNoInteractions(clienteService);
    }

    @Test
    void buscaCom100CaracteresEAceita() throws Exception {
        String busca = "a".repeat(100);
        when(clienteService.listarParaUsuario(ID_OPERADOR, busca, null)).thenReturn(List.of());

        mockMvc.perform(comoOperador(get("/api/clientes").param("busca", busca)))
                .andExpect(status().isOk());
    }

    // ---------- Cadastro e edicao: qualquer autenticado (DEC-029) ----------

    @Test
    void operadorCadastraClienteRetorna201() throws Exception {
        Cliente ana = cliente("Ana");
        when(clienteService.cadastrarParaUsuario(ID_OPERADOR, DADOS_DO_CORPO_VALIDO)).thenReturn(ana);

        mockMvc.perform(comoOperador(comCorpo(post("/api/clientes"), CORPO_VALIDO)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(ana.getUuid().toString()))
                .andExpect(jsonPath("$.telefoneEWhatsapp").value(true))
                .andExpect(jsonPath("$.whatsapp").value(TELEFONE))
                .andExpect(jsonPath("$.ativo").value(true))
                .andExpect(jsonPath("$.empresaId").doesNotExist())
                .andExpect(jsonPath("$.empresa").doesNotExist());
    }

    @Test
    void operadorAtualizaClienteRetorna200() throws Exception {
        Cliente ana = cliente("Ana Souza");
        UUID id = ana.getUuid();
        DadosCliente dados = new DadosCliente("Ana Souza", null, "11987654321", false, "11912345678", "VIP");
        when(clienteService.atualizarParaUsuario(ID_OPERADOR, id, dados)).thenReturn(ana);

        mockMvc.perform(comoOperador(comCorpo(patch("/api/clientes/" + id), """
                        { "nome": "Ana Souza", "telefone": "11987654321", "telefoneEWhatsapp": false,
                          "whatsapp": "11912345678", "observacoes": "VIP" }
                        """)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nome").value("Ana Souza"));

        verify(clienteService).atualizarParaUsuario(ID_OPERADOR, id, dados);
    }

    @Test
    void operadorAtualizaIgnorandoAtivoEmpresaIdEIdDoCorpo() throws Exception {
        Cliente ana = cliente("Ana");
        UUID id = ana.getUuid();
        when(clienteService.atualizarParaUsuario(eq(ID_OPERADOR), eq(id), any(DadosCliente.class))).thenReturn(ana);

        mockMvc.perform(comoOperador(comCorpo(patch("/api/clientes/" + id), """
                        { "nome": "Ana", "cpf": "111.444.777-35", "telefone": "(11) 98765-4321",
                          "ativo": false, "empresaId": 99, "id": 5 }
                        """)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(true));

        ArgumentCaptor<DadosCliente> dadosRecebidos = ArgumentCaptor.forClass(DadosCliente.class);
        verify(clienteService).atualizarParaUsuario(eq(ID_OPERADOR), eq(id), dadosRecebidos.capture());
        assertThat(dadosRecebidos.getValue()).isEqualTo(DADOS_DO_CORPO_VALIDO);
        verify(clienteService, never()).inativarParaUsuario(any(), any());
    }

    @Test
    void atualizarClienteDeOutraEmpresaRetorna404() throws Exception {
        UUID deOutraEmpresa = UUID.randomUUID();
        when(clienteService.atualizarParaUsuario(ID_OPERADOR, deOutraEmpresa, DADOS_DO_CORPO_VALIDO))
                .thenThrow(new ClienteNaoEncontradoException());

        mockMvc.perform(comoOperador(comCorpo(patch("/api/clientes/" + deOutraEmpresa), CORPO_VALIDO)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Cliente não encontrado."));
    }

    // ---------- Inativar/reativar: so ADMIN (DEC-029) ----------

    @Test
    void operadorInativarRetorna403() throws Exception {
        mockMvc.perform(comoOperador(patch("/api/clientes/" + UUID.randomUUID() + "/inativar")))
                .andExpect(status().isForbidden());

        verifyNoInteractions(clienteService);
    }

    @Test
    void operadorReativarRetorna403() throws Exception {
        mockMvc.perform(comoOperador(patch("/api/clientes/" + UUID.randomUUID() + "/reativar")))
                .andExpect(status().isForbidden());

        verifyNoInteractions(clienteService);
    }

    @Test
    void operadorBarradoEmInativarComQualquerMetodoHttp() throws Exception {
        String rota = "/api/clientes/" + UUID.randomUUID() + "/inativar";

        mockMvc.perform(comoOperador(post(rota)))
                .andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(put(rota)))
                .andExpect(status().isForbidden());

        verifyNoInteractions(clienteService);
    }

    @Test
    void adminInativarClienteDeOutraEmpresaRetorna404() throws Exception {
        UUID deOutraEmpresa = UUID.randomUUID();
        when(clienteService.inativarParaUsuario(ID_ADMIN, deOutraEmpresa))
                .thenThrow(new ClienteNaoEncontradoException());

        mockMvc.perform(comoAdmin(patch("/api/clientes/" + deOutraEmpresa + "/inativar")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Cliente não encontrado."));
    }

    @Test
    void adminInativarRetorna200() throws Exception {
        Cliente ana = cliente("Ana");
        ana.inativar();
        when(clienteService.inativarParaUsuario(ID_ADMIN, ana.getUuid())).thenReturn(ana);

        mockMvc.perform(comoAdmin(patch("/api/clientes/" + ana.getUuid() + "/inativar")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(false));
    }

    @Test
    void adminReativarRetorna200() throws Exception {
        Cliente ana = cliente("Ana");
        when(clienteService.reativarParaUsuario(ID_ADMIN, ana.getUuid())).thenReturn(ana);

        mockMvc.perform(comoAdmin(patch("/api/clientes/" + ana.getUuid() + "/reativar")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(true));
    }

    // ---------- Validacao de entrada (400) ----------

    @Test
    void cadastrarSemNomeRetorna400ComCampoNome() throws Exception {
        mockMvc.perform(comoOperador(comCorpo(post("/api/clientes"), "{ \"nome\": \"  \" }")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='nome')].mensagem")
                        .value(hasItem("Nome do cliente é obrigatório.")));

        verifyNoInteractions(clienteService);
    }

    @Test
    void cadastrarComCpfInvalidoRetorna400() throws Exception {
        mockMvc.perform(comoOperador(comCorpo(post("/api/clientes"),
                        "{ \"nome\": \"Ana\", \"cpf\": \"111.111.111-11\" }")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='cpf')]").exists())
                // CPF e dado pessoal: o valor enviado nao volta na resposta.
                .andExpect(content().string(not(containsString("111.111.111-11"))));

        verifyNoInteractions(clienteService);
    }

    @Test
    void cadastrarComTelefoneInvalidoRetorna400() throws Exception {
        mockMvc.perform(comoOperador(comCorpo(post("/api/clientes"),
                        "{ \"nome\": \"Ana\", \"telefone\": \"(01) 2345-678\" }")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='telefone')]").exists());

        verifyNoInteractions(clienteService);
    }

    @Test
    void cadastrarComTelefoneAcimaDe20CaracteresRetorna400() throws Exception {
        // Telefone valido em digitos, mas com separadores alem do limite do campo.
        mockMvc.perform(comoOperador(comCorpo(post("/api/clientes"), """
                        { "nome": "Ana", "telefone": "(11)  9 8 7 6 5 - 4 3 2 1" }
                        """)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='telefone')].mensagem")
                        .value(hasItem("Telefone deve ter no máximo 20 caracteres.")));

        verifyNoInteractions(clienteService);
    }

    @Test
    void whatsappInvalidoEIgnoradoQuandoTelefoneEWhatsapp() throws Exception {
        DadosCliente dados = new DadosCliente("Ana", null, "(11) 98765-4321", true, "123", null);
        when(clienteService.cadastrarParaUsuario(ID_OPERADOR, dados)).thenReturn(cliente("Ana"));

        mockMvc.perform(comoOperador(comCorpo(post("/api/clientes"), """
                        { "nome": "Ana", "telefone": "(11) 98765-4321", "telefoneEWhatsapp": true, "whatsapp": "123" }
                        """)))
                .andExpect(status().isCreated());

        verify(clienteService).cadastrarParaUsuario(ID_OPERADOR, dados);
    }

    @Test
    void whatsappInvalidoComWhatsappProprioRetorna400() throws Exception {
        mockMvc.perform(comoOperador(comCorpo(post("/api/clientes"), """
                        { "nome": "Ana", "telefone": "(11) 98765-4321", "telefoneEWhatsapp": false, "whatsapp": "123" }
                        """)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='whatsapp')].mensagem")
                        .value(hasItem("WhatsApp inválido.")));

        verifyNoInteractions(clienteService);
    }

    @Test
    void dadosInvalidosNoServiceRetornam400ComMensagem() throws Exception {
        when(clienteService.cadastrarParaUsuario(eq(ID_OPERADOR), any(DadosCliente.class)))
                .thenThrow(new DadosClienteInvalidosException("WhatsApp inválido."));

        mockMvc.perform(comoOperador(comCorpo(post("/api/clientes"), CORPO_VALIDO)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("WhatsApp inválido."));
    }

    // ---------- Conflito (409) e nao encontrado (404) ----------

    @Test
    void cpfDuplicadoRetorna409() throws Exception {
        String mensagem = "Já existe um cliente com este CPF nesta empresa.";
        when(clienteService.cadastrarParaUsuario(ID_OPERADOR, DADOS_DO_CORPO_VALIDO))
                .thenThrow(new ClienteConflitoException(mensagem));

        mockMvc.perform(comoOperador(comCorpo(post("/api/clientes"), CORPO_VALIDO)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(mensagem));
    }

    @Test
    void clienteDeOutraEmpresaRetorna404() throws Exception {
        UUID deOutraEmpresa = UUID.randomUUID();
        when(clienteService.buscarParaUsuario(ID_OPERADOR, deOutraEmpresa))
                .thenThrow(new ClienteNaoEncontradoException());

        mockMvc.perform(comoOperador(get("/api/clientes/" + deOutraEmpresa)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Cliente não encontrado."));
    }

    // ---------- Parametros malformados (400, sem eco do valor) ----------

    @Test
    void uuidMalformadoRetorna400() throws Exception {
        mockMvc.perform(comoOperador(get("/api/clientes/abc")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Identificador inválido."))
                .andExpect(jsonPath("$.mensagem", not(containsString("abc"))))
                // Nada da mensagem tecnica da conversao chega ao cliente.
                .andExpect(content().string(not(containsString("UUID"))))
                .andExpect(content().string(not(containsString("convert"))));

        verifyNoInteractions(clienteService);
    }

    @Test
    void filtroAtivoMalformadoRetorna400() throws Exception {
        mockMvc.perform(comoOperador(get("/api/clientes").param("ativo", "talvez")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Parâmetro inválido."))
                .andExpect(content().string(not(containsString("talvez"))));

        verifyNoInteractions(clienteService);
    }

    @Test
    void listarSemFiltrosRepassaNulos() throws Exception {
        when(clienteService.listarParaUsuario(eq(ID_ADMIN), isNull(), isNull())).thenReturn(List.of());

        mockMvc.perform(comoAdmin(get("/api/clientes")))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"));
    }
}
