package com.geitus.app.catalog.balanca;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.balanca.dto.ConfiguracaoEtiquetaRequest;
import com.geitus.app.catalog.balanca.dto.ConfiguracaoEtiquetaResponse;
import com.geitus.app.catalog.balanca.dto.ProdutoAfetadoResponse;
import com.geitus.app.catalog.balanca.dto.SalvarEtiquetaResponse;
import com.geitus.app.catalog.balanca.dto.TesteEtiquetaRequest;
import com.geitus.app.catalog.balanca.dto.TesteEtiquetaResponse;
import com.geitus.app.config.RestAccessDeniedHandler;
import com.geitus.app.config.RestAuthenticationEntryPoint;
import com.geitus.app.config.SecurityConfig;
import com.geitus.app.iam.JwtAuthenticationFilter;
import com.geitus.app.iam.JwtService;
import com.geitus.app.iam.Usuario;
import com.geitus.app.shared.error.GlobalExceptionHandler;

/**
 * Contrato HTTP de {@code /api/etiqueta-balanca} (spec de Produtos): RBAC (leitura e
 * teste para autenticados, salvar so ADMIN, qualquer outra rota sob o caminho
 * ADMIN), Bean Validation e mapeamento dos erros. Fatia web: o
 * {@link EtiquetaBalancaService} e mockado; o banco e exercido no
 * {@code EtiquetaBalancaIT}.
 */
@WebMvcTest(EtiquetaBalancaController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtService.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class,
        GlobalExceptionHandler.class
})
class EtiquetaBalancaControllerTest {

    private static final String CAMINHO = "/api/etiqueta-balanca";
    private static final Long ID_ADMIN = 1L;
    private static final Long ID_OPERADOR = 2L;
    private static final String CONFIGURACAO_PADRAO_JSON = """
            { "prefixo": "2", "digitosCodigo": 6, "digitosPreenchimento": 0, "tipoInformacao": "VALOR",
              "digitosInformacao": 6, "casasDecimais": 3, "digitoVerificador": false }""";
    private static final ConfiguracaoEtiquetaRequest CONFIGURACAO_PADRAO =
            new ConfiguracaoEtiquetaRequest("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private EtiquetaBalancaService etiquetaService;

    private String token(Long idUsuario, String perfil) {
        Usuario usuario = mock(Usuario.class);
        when(usuario.getId()).thenReturn(idUsuario);
        when(usuario.getPerfil()).thenReturn(perfil);
        when(usuario.getEmpresaId()).thenReturn(7L);
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

    private static String corpoDoTeste(String codigoLido) {
        return "{ \"codigoLido\": \"" + codigoLido + "\", \"configuracao\": " + CONFIGURACAO_PADRAO_JSON + " }";
    }

    // ---------- Autenticacao e RBAC ----------

    @Test
    void semToken_401() throws Exception {
        mockMvc.perform(get(CAMINHO)).andExpect(status().isUnauthorized());
        mockMvc.perform(comCorpo(post(CAMINHO + "/teste"), corpoDoTeste("2000542010000")))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(etiquetaService);
    }

    @Test
    void getSemConfiguracaoDevolvePadrao() throws Exception {
        when(etiquetaService.buscarParaUsuario(ID_OPERADOR))
                .thenReturn(ConfiguracaoEtiquetaResponse.de(ConfiguracaoEtiqueta.padrao(), true));

        mockMvc.perform(comoOperador(get(CAMINHO)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.prefixo").value("2"))
                .andExpect(jsonPath("$.digitosCodigo").value(6))
                .andExpect(jsonPath("$.digitosPreenchimento").value(0))
                .andExpect(jsonPath("$.tipoInformacao").value("VALOR"))
                .andExpect(jsonPath("$.digitosInformacao").value(6))
                .andExpect(jsonPath("$.casasDecimais").value(3))
                .andExpect(jsonPath("$.digitoVerificador").value(false))
                .andExpect(jsonPath("$.padrao").value(true))
                .andExpect(jsonPath("$.empresaId").doesNotExist())
                .andExpect(jsonPath("$.id").doesNotExist());
    }

    @Test
    void putOperador_403() throws Exception {
        mockMvc.perform(comCorpo(comoOperador(put(CAMINHO)), CONFIGURACAO_PADRAO_JSON))
                .andExpect(status().isForbidden());

        verifyNoInteractions(etiquetaService);
    }

    /** Outras rotas e metodos sob o caminho caem na regra de ADMIN, nao na geral de autenticado. */
    @Test
    void outrosMetodosComOperador_403() throws Exception {
        mockMvc.perform(comCorpo(comoOperador(post(CAMINHO)), CONFIGURACAO_PADRAO_JSON))
                .andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(delete(CAMINHO))).andExpect(status().isForbidden());
        mockMvc.perform(comoOperador(get(CAMINHO + "/teste"))).andExpect(status().isForbidden());

        verifyNoInteractions(etiquetaService);
    }

    @Test
    void putValidoGravaEDevolve() throws Exception {
        UUID produto = UUID.fromString("00000000-0000-0000-0000-000000000005");
        when(etiquetaService.salvarParaUsuario(ID_ADMIN, CONFIGURACAO_PADRAO)).thenReturn(new SalvarEtiquetaResponse(
                ConfiguracaoEtiquetaResponse.de(ConfiguracaoEtiqueta.padrao(), false),
                List.of(new ProdutoAfetadoResponse(produto, 15L, "Açúcar a granel", 12345))));

        mockMvc.perform(comCorpo(comoAdmin(put(CAMINHO)), CONFIGURACAO_PADRAO_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.configuracao.padrao").value(false))
                .andExpect(jsonPath("$.configuracao.digitosCodigo").value(6))
                .andExpect(jsonPath("$.produtosComCodigoGrandeDemais[0].id").value(produto.toString()))
                .andExpect(jsonPath("$.produtosComCodigoGrandeDemais[0].numero").value(15))
                .andExpect(jsonPath("$.produtosComCodigoGrandeDemais[0].nome").value("Açúcar a granel"))
                .andExpect(jsonPath("$.produtosComCodigoGrandeDemais[0].codigo").value(12345));

        verify(etiquetaService).salvarParaUsuario(ID_ADMIN, CONFIGURACAO_PADRAO);
    }

    @Test
    void putSemCampo_400ComOCampo() throws Exception {
        mockMvc.perform(comCorpo(comoAdmin(put(CAMINHO)), "{ \"prefixo\": \"2\" }"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='digitosCodigo')].mensagem")
                        .value("Informe os dígitos do código."))
                .andExpect(jsonPath("$.campos[?(@.campo=='tipoInformacao')]").exists());

        verifyNoInteractions(etiquetaService);
    }

    @Test
    void putComTipoDesconhecido_400() throws Exception {
        mockMvc.perform(comCorpo(comoAdmin(put(CAMINHO)), CONFIGURACAO_PADRAO_JSON.replace("VALOR", "QUANTIA")))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(etiquetaService);
    }

    @Test
    void putComSomaDiferenteDe13_400ComMensagem() throws Exception {
        when(etiquetaService.salvarParaUsuario(eq(ID_ADMIN), any(ConfiguracaoEtiquetaRequest.class)))
                .thenThrow(new RegraDeNegocioException("A etiqueta precisa ter 13 dígitos no total (hoje: 14)."));

        mockMvc.perform(comCorpo(comoAdmin(put(CAMINHO)),
                        CONFIGURACAO_PADRAO_JSON.replace("\"digitoVerificador\": false", "\"digitoVerificador\": true")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("A etiqueta precisa ter 13 dígitos no total (hoje: 14)."));
    }

    // ---------- Teste de etiqueta ----------

    @Test
    void testeComOperador_200() throws Exception {
        UUID produto = UUID.fromString("00000000-0000-0000-0000-000000000005");
        TesteEtiquetaRequest esperado = new TesteEtiquetaRequest("2000542010000", CONFIGURACAO_PADRAO);
        when(etiquetaService.testarParaUsuario(ID_OPERADOR, esperado)).thenReturn(new TesteEtiquetaResponse(
                new TesteEtiquetaResponse.Leitura(542, TipoInformacaoEtiqueta.VALOR, new BigDecimal("10.000")),
                new TesteEtiquetaResponse.ProdutoDaEtiqueta(produto, 15L, "Açúcar a granel", "KG"),
                "Produto 542 · Açúcar a granel · R$ 10,00"));

        mockMvc.perform(comCorpo(comoOperador(post(CAMINHO + "/teste")), corpoDoTeste("2000542010000")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.leitura.codigoProduto").value(542))
                .andExpect(jsonPath("$.leitura.tipo").value("VALOR"))
                .andExpect(jsonPath("$.leitura.valor").value(10.0))
                .andExpect(jsonPath("$.produto.id").value(produto.toString()))
                .andExpect(jsonPath("$.produto.numero").value(15))
                .andExpect(jsonPath("$.produto.nome").value("Açúcar a granel"))
                .andExpect(jsonPath("$.produto.unidade").value("KG"))
                .andExpect(jsonPath("$.mensagem").value("Produto 542 · Açúcar a granel · R$ 10,00"));
    }

    @Test
    void testeForaDoFormatoRespondeLeituraEProdutoNulos() throws Exception {
        when(etiquetaService.testarParaUsuario(eq(ID_OPERADOR), any(TesteEtiquetaRequest.class)))
                .thenReturn(new TesteEtiquetaResponse(null, null, "Este número não é uma etiqueta neste formato."));

        mockMvc.perform(comCorpo(comoOperador(post(CAMINHO + "/teste")), corpoDoTeste("7891000315507")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.leitura").doesNotExist())
                .andExpect(jsonPath("$.produto").doesNotExist())
                .andExpect(jsonPath("$.mensagem").value("Este número não é uma etiqueta neste formato."));
    }

    @Test
    void testeSemNumeroOuSemConfiguracao_400() throws Exception {
        mockMvc.perform(comCorpo(comoOperador(post(CAMINHO + "/teste")), corpoDoTeste(" ")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='codigoLido')].mensagem")
                        .value("Informe o número da etiqueta."));
        mockMvc.perform(comCorpo(comoOperador(post(CAMINHO + "/teste")), "{ \"codigoLido\": \"2000542010000\" }"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='configuracao')]").exists());
        mockMvc.perform(comCorpo(comoOperador(post(CAMINHO + "/teste")),
                        "{ \"codigoLido\": \"2000542010000\", \"configuracao\": { \"prefixo\": \"2\" } }"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='configuracao.digitosCodigo')]").exists());

        verifyNoInteractions(etiquetaService);
    }

    @Test
    void testeComNumeroLongoDemais_400() throws Exception {
        mockMvc.perform(comCorpo(comoOperador(post(CAMINHO + "/teste")), corpoDoTeste("2".repeat(51))))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(etiquetaService);
    }
}
