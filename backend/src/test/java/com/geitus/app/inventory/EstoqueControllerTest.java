package com.geitus.app.inventory;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.LocalDateTime;
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

import com.geitus.app.catalog.ProdutoConflitoException;
import com.geitus.app.catalog.ProdutoNaoEncontradoException;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.config.RestAccessDeniedHandler;
import com.geitus.app.config.RestAuthenticationEntryPoint;
import com.geitus.app.config.SecurityConfig;
import com.geitus.app.iam.JwtAuthenticationFilter;
import com.geitus.app.iam.JwtService;
import com.geitus.app.iam.Usuario;
import com.geitus.app.inventory.EstoqueService.ResultadoAjuste;
import com.geitus.app.inventory.dto.AjusteEstoqueRequest;
import com.geitus.app.inventory.dto.MovimentoEstoqueResponse;
import com.geitus.app.shared.error.GlobalExceptionHandler;
import com.geitus.app.shared.paginacao.PaginaResponse;

/**
 * Contrato HTTP dos endpoints de estoque do produto (spec de Estoque): ajuste so para
 * ADMIN (regra {@code POST /api/produtos/**} do {@code SecurityConfig}),
 * leitura dos movimentos para qualquer autenticado, 201 x 200 pela chave e os
 * erros de entrada. Fatia web sem banco; o {@link EstoqueService} e mockado.
 */
@WebMvcTest(EstoqueController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtService.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class,
        GlobalExceptionHandler.class
})
class EstoqueControllerTest {

    private static final UUID PRODUTO_ID = UUID.fromString("00000000-0000-0000-0000-000000000005");
    private static final UUID CHAVE = UUID.fromString("2c1f0000-0000-0000-0000-000000000001");
    private static final String AJUSTES = "/api/produtos/" + PRODUTO_ID + "/estoque/ajustes";
    private static final String MOVIMENTOS = "/api/produtos/" + PRODUTO_ID + "/estoque/movimentos";
    private static final String AJUSTE_VALIDO = """
            { "tipo": "SAIDA", "quantidade": 2, "motivo": "PERDA_AVARIA", "observacao": "Caixa amassada",
              "chave": "2c1f0000-0000-0000-0000-000000000001" }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private EstoqueService estoqueService;

    private String token(Long idUsuario, String perfil) {
        Usuario usuario = mock(Usuario.class);
        when(usuario.getId()).thenReturn(idUsuario);
        when(usuario.getPerfil()).thenReturn(perfil);
        when(usuario.getEmpresaId()).thenReturn(7L);
        return "Bearer " + jwtService.gerarToken(usuario);
    }

    private static MockHttpServletRequestBuilder postarAjuste(String corpo) {
        return post(AJUSTES).contentType(MediaType.APPLICATION_JSON).content(corpo);
    }

    private static MovimentoEstoqueResponse saidaDeDois() {
        return new MovimentoEstoqueResponse(UUID.fromString("00000000-0000-0000-0000-0000000000a1"),
                TipoMovimento.SAIDA, MotivoMovimento.PERDA_AVARIA, OrigemMovimento.AJUSTE_MANUAL,
                new BigDecimal("-2.000"), new BigDecimal("12.000"), new BigDecimal("10.000"), "Caixa amassada",
                "Ana Souza", LocalDateTime.of(2026, 10, 21, 15, 20), null, null, null, null);
    }

    // ---------- Ajuste ----------

    @Test
    void semToken_401() throws Exception {
        mockMvc.perform(postarAjuste(AJUSTE_VALIDO)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(MOVIMENTOS)).andExpect(status().isUnauthorized());

        verifyNoInteractions(estoqueService);
    }

    @Test
    void operadorAjustando_403() throws Exception {
        mockMvc.perform(postarAjuste(AJUSTE_VALIDO).header("Authorization", token(2L, "OPERADOR")))
                .andExpect(status().isForbidden());

        verifyNoInteractions(estoqueService);
    }

    @Test
    void ajusteCriado_201() throws Exception {
        when(estoqueService.ajustarParaUsuario(eq(1L), eq(PRODUTO_ID), any(AjusteEstoqueRequest.class)))
                .thenReturn(new ResultadoAjuste(saidaDeDois(), true));

        mockMvc.perform(postarAjuste(AJUSTE_VALIDO).header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("00000000-0000-0000-0000-0000000000a1"))
                .andExpect(jsonPath("$.tipo").value("SAIDA"))
                .andExpect(jsonPath("$.motivo").value("PERDA_AVARIA"))
                .andExpect(jsonPath("$.origem").value("AJUSTE_MANUAL"))
                .andExpect(jsonPath("$.quantidade").value(-2.0))
                .andExpect(jsonPath("$.saldoAnterior").value(12.0))
                .andExpect(jsonPath("$.saldoNovo").value(10.0))
                .andExpect(jsonPath("$.observacao").value("Caixa amassada"))
                .andExpect(jsonPath("$.usuarioNome").value("Ana Souza"))
                .andExpect(jsonPath("$.criadoEm").value("2026-10-21T15:20:00"))
                .andExpect(jsonPath("$.usuarioId").doesNotExist());

        verify(estoqueService).ajustarParaUsuario(1L, PRODUTO_ID, new AjusteEstoqueRequest(TipoMovimento.SAIDA,
                new BigDecimal("2"), MotivoMovimento.PERDA_AVARIA, "Caixa amassada", CHAVE,
                null, null, null));
    }

    /** Fase B3: o {@code embalagemId} chega ao service e o retrato da embalagem sai na resposta. */
    @Test
    void ajusteEmEmbalagensRepassaAEmbalagemEDevolveORetrato() throws Exception {
        UUID caixa = UUID.fromString("00000000-0000-0000-0000-0000000000c1");
        MovimentoEstoqueResponse entrada = new MovimentoEstoqueResponse(
                UUID.fromString("00000000-0000-0000-0000-0000000000a2"), TipoMovimento.ENTRADA,
                MotivoMovimento.COMPRA, OrigemMovimento.AJUSTE_MANUAL, new BigDecimal("36.000"),
                new BigDecimal("10.000"), new BigDecimal("46.000"), null, "Ana Souza",
                LocalDateTime.of(2026, 10, 24, 9, 0),
                new MovimentoEstoqueResponse.EmbalagemDoMovimento("CX c/ 18 UN", new BigDecimal("18.000"), 2),
                new BigDecimal("180.00"), new BigDecimal("10.0000"), null);
        when(estoqueService.ajustarParaUsuario(eq(1L), eq(PRODUTO_ID), any(AjusteEstoqueRequest.class)))
                .thenReturn(new ResultadoAjuste(entrada, true));

        mockMvc.perform(postarAjuste("""
                        { "tipo": "ENTRADA", "quantidade": 2, "motivo": "COMPRA",
                          "chave": "2c1f0000-0000-0000-0000-000000000001",
                          "embalagemId": "00000000-0000-0000-0000-0000000000c1", "custo": 180.00 }
                        """).header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.quantidade").value(36.0))
                .andExpect(jsonPath("$.custoInformado").value(180.0))
                .andExpect(jsonPath("$.custoUnitario").value(10.0))
                .andExpect(jsonPath("$.embalagem.rotulo").value("CX c/ 18 UN"))
                .andExpect(jsonPath("$.embalagem.quantidadePorEmbalagem").value(18.0))
                .andExpect(jsonPath("$.embalagem.quantidadeDeEmbalagens").value(2));

        verify(estoqueService).ajustarParaUsuario(1L, PRODUTO_ID, new AjusteEstoqueRequest(TipoMovimento.ENTRADA,
                new BigDecimal("2"), MotivoMovimento.COMPRA, null, CHAVE, caixa, new BigDecimal("180.00"), null));
    }

    @Test
    void chaveRepetida_200() throws Exception {
        when(estoqueService.ajustarParaUsuario(eq(1L), eq(PRODUTO_ID), any(AjusteEstoqueRequest.class)))
                .thenReturn(new ResultadoAjuste(saidaDeDois(), false));

        mockMvc.perform(postarAjuste(AJUSTE_VALIDO).header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.saldoNovo").value(10.0));
    }

    @Test
    void uuidMalformado_400() throws Exception {
        mockMvc.perform(post("/api/produtos/abc/estoque/ajustes").contentType(MediaType.APPLICATION_JSON)
                        .content(AJUSTE_VALIDO).header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Identificador inválido."));
        mockMvc.perform(get("/api/produtos/abc/estoque/movimentos").header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Identificador inválido."));

        verifyNoInteractions(estoqueService);
    }

    @Test
    void tipoInvalido_400() throws Exception {
        mockMvc.perform(postarAjuste(AJUSTE_VALIDO.replace("\"SAIDA\"", "\"TROCA\""))
                        .header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(estoqueService);
    }

    @Test
    void camposObrigatoriosAusentes_400ComOsCampos() throws Exception {
        mockMvc.perform(postarAjuste("{}").header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo == 'tipo')].mensagem").value("Informe o tipo do movimento."))
                .andExpect(jsonPath("$.campos[?(@.campo == 'quantidade')].mensagem").value("Informe a quantidade."))
                .andExpect(jsonPath("$.campos[?(@.campo == 'motivo')].mensagem").value("Informe o motivo."))
                .andExpect(jsonPath("$.campos[?(@.campo == 'chave')].mensagem")
                        .value("Informe a chave da operação."));

        verifyNoInteractions(estoqueService);
    }

    @Test
    void quantidadeComCasasDemaisEObservacaoLonga_400() throws Exception {
        String corpo = """
                { "tipo": "ENTRADA", "quantidade": 1.0001, "motivo": "COMPRA", "observacao": "%s",
                  "chave": "2c1f0000-0000-0000-0000-000000000001" }
                """.formatted("x".repeat(201));

        mockMvc.perform(postarAjuste(corpo).header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo == 'quantidade')].mensagem")
                        .value("A quantidade deve ter no máximo 9 dígitos inteiros e 3 casas decimais."))
                .andExpect(jsonPath("$.campos[?(@.campo == 'observacao')].mensagem")
                        .value("A observação deve ter no máximo 200 caracteres."));
    }

    @Test
    void quantidadeComDezDigitosInteiros_400() throws Exception {
        String corpo = AJUSTE_VALIDO.replace("\"quantidade\": 2", "\"quantidade\": 1000000000");

        mockMvc.perform(postarAjuste(corpo).header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo == 'quantidade')].mensagem")
                        .value("A quantidade deve ter no máximo 9 dígitos inteiros e 3 casas decimais."));

        verifyNoInteractions(estoqueService);
    }

    @Test
    void regraDoServiceComCampo_400ComCampos() throws Exception {
        when(estoqueService.ajustarParaUsuario(eq(1L), eq(PRODUTO_ID), any(AjusteEstoqueRequest.class)))
                .thenThrow(new RegraDeNegocioException("Saldo insuficiente: há 3 UN.", "quantidade"));

        mockMvc.perform(postarAjuste(AJUSTE_VALIDO).header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Saldo insuficiente: há 3 UN."))
                .andExpect(jsonPath("$.campos[0].campo").value("quantidade"));
    }

    @Test
    void chaveComOutrosDados_409() throws Exception {
        when(estoqueService.ajustarParaUsuario(eq(1L), eq(PRODUTO_ID), any(AjusteEstoqueRequest.class)))
                .thenThrow(new ProdutoConflitoException("Esta operação já foi registrada com outros dados."));

        mockMvc.perform(postarAjuste(AJUSTE_VALIDO).header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Esta operação já foi registrada com outros dados."));
    }

    @Test
    void ajusteEmProdutoDeOutraEmpresa_404() throws Exception {
        when(estoqueService.ajustarParaUsuario(eq(1L), eq(PRODUTO_ID), any(AjusteEstoqueRequest.class)))
                .thenThrow(new ProdutoNaoEncontradoException());

        mockMvc.perform(postarAjuste(AJUSTE_VALIDO).header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Produto não encontrado."));
    }

    // ---------- Movimentos ----------

    @Test
    void operadorLendoMovimentos_200() throws Exception {
        when(estoqueService.movimentosParaUsuario(2L, PRODUTO_ID, 0, 20))
                .thenReturn(new PaginaResponse<>(List.of(saidaDeDois()), 0, 20, 1));

        mockMvc.perform(get(MOVIMENTOS).header("Authorization", token(2L, "OPERADOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens[0].tipo").value("SAIDA"))
                .andExpect(jsonPath("$.itens[0].usuarioNome").value("Ana Souza"))
                .andExpect(jsonPath("$.pagina").value(0))
                .andExpect(jsonPath("$.tamanho").value(20))
                .andExpect(jsonPath("$.totalItens").value(1));
    }

    @Test
    void movimentosRepassaPaginaETamanho() throws Exception {
        when(estoqueService.movimentosParaUsuario(1L, PRODUTO_ID, 2, 5))
                .thenReturn(new PaginaResponse<>(List.of(), 2, 5, 3));

        mockMvc.perform(get(MOVIMENTOS).param("pagina", "2").param("tamanho", "5")
                        .header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens").isEmpty());
    }

    @Test
    void paginaGrandeDemais_400() throws Exception {
        when(estoqueService.movimentosParaUsuario(1L, PRODUTO_ID, 0, 101))
                .thenThrow(new RegraDeNegocioException("O tamanho da página deve ser entre 1 e 100."));

        mockMvc.perform(get(MOVIMENTOS).param("tamanho", "101").header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("O tamanho da página deve ser entre 1 e 100."));
    }

    @Test
    void paginaNaoNumerica_400() throws Exception {
        mockMvc.perform(get(MOVIMENTOS).param("pagina", "abc").header("Authorization", token(1L, "ADMIN")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Parâmetro inválido."));

        verifyNoInteractions(estoqueService);
    }
}
