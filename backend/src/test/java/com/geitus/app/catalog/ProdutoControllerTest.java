package com.geitus.app.catalog;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.dto.ProdutoRequest;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.iam.JwtAuthenticationFilter;
import com.geitus.app.iam.JwtService;
import com.geitus.app.company.Empresa;
import com.geitus.app.config.RestAccessDeniedHandler;
import com.geitus.app.config.RestAuthenticationEntryPoint;
import com.geitus.app.config.SecurityConfig;
import com.geitus.app.shared.error.GlobalExceptionHandler;
import com.geitus.app.iam.Usuario;

/**
 * Testa o contrato HTTP dos endpoints de produtos (rotas protegidas, regras de
 * entrada e isolamento por empresa - DEC-016), usando uma fatia web sem banco
 * de dados.
 *
 * <p>O {@link JwtService} e um bean real (para gerar tokens de teste); o
 * {@link ProdutoService} e mockado.
 */
@WebMvcTest(ProdutoController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtService.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class,
        GlobalExceptionHandler.class
})
class ProdutoControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private ProdutoService produtoService;

    private static final String NOME_151_CARACTERES = "A".repeat(151);
    private static final UUID UNIDADE_ID = UUID.fromString("00000000-0000-0000-0000-0000000000aa");
    private static final String UNIDADE_JSON = "\"unidadeId\": \"" + UNIDADE_ID + "\"";

    /** Corpo JSON valido minimo (nome, preco e unidade) mais campos extras opcionais. */
    private static String corpo(String nome, String preco, String... extras) {
        StringBuilder json = new StringBuilder("{ \"nome\": \"").append(nome).append("\", \"precoVenda\": ")
                .append(preco).append(", ").append(UNIDADE_JSON);
        for (String extra : extras) {
            json.append(", ").append(extra);
        }
        return json.append(" }").toString();
    }

    private ProdutoResponse respostaComId(Long id, String nome, String sku) {
        return ProdutoResponse.de(produtoComId(id, nome, sku), CategoriaArvore.de(List.of()));
    }

    private Produto produtoComId(Long id, String nome, String sku) {
        Empresa empresa = new Empresa("Empresa 7");
        ReflectionTestUtils.setField(empresa, "id", 7L);
        UnidadeMedida unidade = new UnidadeMedida(empresa, "UN", "Unidade", false);
        Produto produto = new Produto(empresa, nome, unidade, null, null, null, new BigDecimal("10.00"),
                null, null, null, sku, null, null, null, null, null);
        ReflectionTestUtils.setField(produto, "id", id);
        return produto;
    }

    private String tokenParaUsuario(Long idUsuario) {
        return tokenParaUsuarioComPerfil(idUsuario, "ADMIN");
    }

    private String tokenParaUsuarioComPerfil(Long idUsuario, String perfil) {
        Usuario usuario = org.mockito.Mockito.mock(Usuario.class);
        when(usuario.getId()).thenReturn(idUsuario);
        when(usuario.getPerfil()).thenReturn(perfil);
        when(usuario.getEmpresaId()).thenReturn(7L);
        return jwtService.gerarToken(usuario);
    }

    // ---------- Autenticacao ----------

    @Test
    void listarSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(get("/api/produtos"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void cadastrarSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(post("/api/produtos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto\", \"precoVenda\": 10.00 }"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void buscarPorIdSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(get("/api/produtos/5"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void atualizarSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(patch("/api/produtos/5")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto\", \"precoVenda\": 10.00 }"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void inativarSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(patch("/api/produtos/5/inativar"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void reativarSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(patch("/api/produtos/5/reativar"))
                .andExpect(status().isUnauthorized());
    }

    // ---------- RBAC: escrita exige ADMIN, leitura livre ----------

    @Test
    void listarComPerfilOperadorDeveRetornar200() throws Exception {
        when(produtoService.listarParaUsuario(eq(2L), isNull(), isNull())).thenReturn(List.of());

        String token = tokenParaUsuarioComPerfil(2L, "OPERADOR");

        mockMvc.perform(get("/api/produtos").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void cadastrarComPerfilOperadorDeveRetornar403() throws Exception {
        String token = tokenParaUsuarioComPerfil(2L, "OPERADOR");

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto\", \"precoVenda\": 10.00 }"))
                .andExpect(status().isForbidden());

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void atualizarComPerfilOperadorDeveRetornar403() throws Exception {
        String token = tokenParaUsuarioComPerfil(2L, "OPERADOR");

        mockMvc.perform(patch("/api/produtos/5")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto\", \"precoVenda\": 10.00 }"))
                .andExpect(status().isForbidden());

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void inativarComPerfilOperadorDeveRetornar403() throws Exception {
        String token = tokenParaUsuarioComPerfil(2L, "OPERADOR");

        mockMvc.perform(patch("/api/produtos/5/inativar").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void reativarComPerfilOperadorDeveRetornar403() throws Exception {
        String token = tokenParaUsuarioComPerfil(2L, "OPERADOR");

        mockMvc.perform(patch("/api/produtos/5/reativar").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    // ---------- Listagem ----------

    @Test
    void listarComTokenValidoDeveRetornarProdutosDaEmpresaDoUsuario() throws Exception {
        when(produtoService.listarParaUsuario(eq(1L), isNull(), isNull()))
                .thenReturn(List.of(respostaComId(1L, "Arroz 5kg", "SKU-1")));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].nome").value("Arroz 5kg"));

        org.mockito.Mockito.verify(produtoService).listarParaUsuario(eq(1L), isNull(), isNull());
    }

    @Test
    void listarComFiltroBuscaDeveRepassarParametroAoService() throws Exception {
        when(produtoService.listarParaUsuario(eq(1L), eq("arroz"), isNull())).thenReturn(List.of());

        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos").param("busca", "arroz")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        org.mockito.Mockito.verify(produtoService).listarParaUsuario(eq(1L), eq("arroz"), isNull());
    }

    @Test
    void listarComFiltroAtivoDeveRepassarParametroAoService() throws Exception {
        when(produtoService.listarParaUsuario(eq(1L), isNull(), eq(false))).thenReturn(List.of());

        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos").param("ativo", "false")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        org.mockito.Mockito.verify(produtoService).listarParaUsuario(eq(1L), isNull(), eq(false));
    }

    // ---------- Busca por id ----------

    @Test
    void buscarPorIdDaPropriaEmpresaDeveRetornar200() throws Exception {
        when(produtoService.buscarPorIdParaUsuario(1L, 5L)).thenReturn(respostaComId(5L, "Produto X", null));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos/5").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(5))
                .andExpect(jsonPath("$.nome").value("Produto X"));
    }

    @Test
    void buscarPorIdDeOutraEmpresaOuInexistenteDeveRetornar404() throws Exception {
        when(produtoService.buscarPorIdParaUsuario(1L, 99L)).thenThrow(new ProdutoNaoEncontradoException());

        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos/99").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    @Test
    void idMalformadoRetorna400() throws Exception {
        // Antes do handler de MethodArgumentTypeMismatchException caia no generico (500).
        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos/abc").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Identificador inválido."));

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    // ---------- Cadastro ----------

    @Test
    void cadastrarProdutoValidoDeveRetornar201() throws Exception {
        when(produtoService.cadastrarParaUsuario(eq(1L), any(ProdutoRequest.class)))
                .thenReturn(respostaComId(10L, "Produto Novo", "SKU-10"));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto Novo", "10.00")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(10))
                .andExpect(jsonPath("$.nome").value("Produto Novo"))
                .andExpect(jsonPath("$.unidade.sigla").value("UN"));

        ArgumentCaptor<ProdutoRequest> request = ArgumentCaptor.forClass(ProdutoRequest.class);
        org.mockito.Mockito.verify(produtoService).cadastrarParaUsuario(eq(1L), request.capture());
        org.assertj.core.api.Assertions.assertThat(request.getValue().unidadeId()).isEqualTo(UNIDADE_ID);
        org.assertj.core.api.Assertions.assertThat(request.getValue().precoVenda()).isEqualByComparingTo("10.00");
    }

    @Test
    void cadastrarComNomeVazioDeveRetornar400() throws Exception {
        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("", "10.00")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos").isArray());
    }

    @Test
    void cadastrarComPrecoVendaNegativoDeveRetornar400() throws Exception {
        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "-1.00")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cadastrarComSkuDuplicadoDeveRetornar409() throws Exception {
        when(produtoService.cadastrarParaUsuario(eq(1L), any(ProdutoRequest.class)))
                .thenThrow(new ProdutoConflitoException("Já existe um produto com este SKU nesta empresa."));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00", "\"sku\": \"SKU-1\"")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Já existe um produto com este SKU nesta empresa."));
    }

    @Test
    void cadastrarComCodigoBarrasDuplicadoDeveRetornar409() throws Exception {
        when(produtoService.cadastrarParaUsuario(eq(1L), any(ProdutoRequest.class)))
                .thenThrow(new ProdutoConflitoException("Já existe um produto com este código de barras nesta empresa."));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00", "\"codigoBarras\": \"789123\"")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Já existe um produto com este código de barras nesta empresa."));
    }

    @Test
    void cadastrarComNomeAcimaDoTamanhoMaximoDeveRetornar400() throws Exception {
        String token = tokenParaUsuario(1L);

        String corpo = corpo(NOME_151_CARACTERES, "10.00");

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cadastrarComEstoqueMinimoComCasasDecimaisDemaisDeveRetornar400() throws Exception {
        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00", "\"estoqueMinimo\": 1.2345")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='estoqueMinimo')]").exists());
    }

    @Test
    void cadastrarSemUnidadeDeveRetornar400ComOCampo() throws Exception {
        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto\", \"precoVenda\": 10.00 }"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='unidadeId')]").exists())
                .andExpect(jsonPath("$.campos[?(@.campo=='unidadeId')].mensagem").value("Unidade é obrigatória."));

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void cadastrarComFatorZeroOuComCasasDemaisDeveRetornar400() throws Exception {
        String token = tokenParaUsuario(1L);
        String compra = "\"unidadeCompraId\": \"" + UUID.randomUUID() + "\"";

        for (String fator : List.of("0", "-1", "1.23456", "123456789")) {
            mockMvc.perform(post("/api/produtos")
                            .header("Authorization", "Bearer " + token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(corpo("Produto", "10.00", compra, "\"fatorConversao\": " + fator)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.campos[?(@.campo=='fatorConversao')]").exists());
        }

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void cadastrarComUnidadeDeOutraEmpresaDeveRetornar404() throws Exception {
        when(produtoService.cadastrarParaUsuario(eq(1L), any(ProdutoRequest.class)))
                .thenThrow(new CatalogoNaoEncontradoException("Unidade de medida não encontrada."));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Unidade de medida não encontrada."));
    }

    @Test
    void cadastrarComRegraDeConversaoVioladaDeveRetornar400ComMensagem() throws Exception {
        when(produtoService.cadastrarParaUsuario(eq(1L), any(ProdutoRequest.class)))
                .thenThrow(new RegraDeNegocioException("Informe a unidade de compra e o fator de conversão juntos."));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00", "\"fatorConversao\": 12")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Informe a unidade de compra e o fator de conversão juntos."));
    }

    @Test
    void respostaTrazUnidadeCategoriaComCaminhoEConversaoSemIdsInternos() throws Exception {
        Empresa empresa = new Empresa("Empresa 7");
        ReflectionTestUtils.setField(empresa, "id", 7L);
        UnidadeMedida un = new UnidadeMedida(empresa, "UN", "Unidade", false);
        UnidadeMedida cx = new UnidadeMedida(empresa, "CX", "Caixa", false);
        ReflectionTestUtils.setField(un, "id", 31L);
        ReflectionTestUtils.setField(cx, "id", 32L);
        Categoria racao = new Categoria(empresa, null, "Ração");
        ReflectionTestUtils.setField(racao, "id", 41L);
        Categoria umida = new Categoria(empresa, racao, "Úmida");
        ReflectionTestUtils.setField(umida, "id", 42L);
        Produto produto = new Produto(empresa, "Sachê", un, umida, cx, new BigDecimal("12.0000"),
                new BigDecimal("3.50"), null, null, null, null, null, null, null, null, null);
        ReflectionTestUtils.setField(produto, "id", 5L);
        when(produtoService.buscarPorIdParaUsuario(1L, 5L))
                .thenReturn(ProdutoResponse.de(produto, CategoriaArvore.de(List.of(racao, umida))));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos/5").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unidade.id").value(un.getUuid().toString()))
                .andExpect(jsonPath("$.unidade.sigla").value("UN"))
                .andExpect(jsonPath("$.unidade.fracionada").value(false))
                .andExpect(jsonPath("$.categoria.id").value(umida.getUuid().toString()))
                .andExpect(jsonPath("$.categoria.nome").value("Úmida"))
                .andExpect(jsonPath("$.categoria.caminho").value("Ração › Úmida"))
                .andExpect(jsonPath("$.unidadeCompra.sigla").value("CX"))
                .andExpect(jsonPath("$.conversaoTexto").value("1 CX = 12 UN"))
                .andExpect(jsonPath("$.empresaId").doesNotExist())
                .andExpect(jsonPath("$.unidadeId").doesNotExist())
                .andExpect(jsonPath("$.categoriaId").doesNotExist());
    }

    // ---------- Atualizacao ----------

    @Test
    void atualizarProdutoDaPropriaEmpresaDeveRetornar200() throws Exception {
        when(produtoService.atualizarDadosBasicosParaUsuario(eq(1L), eq(5L), any(ProdutoRequest.class)))
                .thenReturn(respostaComId(5L, "Produto Atualizado", null));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/5")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto Atualizado", "15.00")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nome").value("Produto Atualizado"));
    }

    @Test
    void atualizarProdutoDeOutraEmpresaDeveRetornar404() throws Exception {
        when(produtoService.atualizarDadosBasicosParaUsuario(eq(1L), eq(99L), any(ProdutoRequest.class)))
                .thenThrow(new ProdutoNaoEncontradoException());

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/99")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00")))
                .andExpect(status().isNotFound());
    }

    @Test
    void atualizarComSkuDuplicadoDeOutroProdutoDeveRetornar409() throws Exception {
        when(produtoService.atualizarDadosBasicosParaUsuario(eq(1L), eq(5L), any(ProdutoRequest.class)))
                .thenThrow(new ProdutoConflitoException("Já existe um produto com este SKU nesta empresa."));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/5")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00", "\"sku\": \"SKU-DE-OUTRO\"")))
                .andExpect(status().isConflict());
    }

    @Test
    void atualizarMantendoOProprioSkuDeveRetornar200() throws Exception {
        when(produtoService.atualizarDadosBasicosParaUsuario(eq(1L), eq(5L), any(ProdutoRequest.class)))
                .thenReturn(respostaComId(5L, "Produto", "SKU-PROPRIO"));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/5")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00", "\"sku\": \"SKU-PROPRIO\"")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sku").value("SKU-PROPRIO"));
    }

    @Test
    void atualizarComNomeAcimaDoTamanhoMaximoDeveRetornar400() throws Exception {
        String token = tokenParaUsuario(1L);

        String corpo = corpo(NOME_151_CARACTERES, "10.00");

        mockMvc.perform(patch("/api/produtos/5")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo))
                .andExpect(status().isBadRequest());
    }

    // ---------- Inativar / reativar ----------

    @Test
    void inativarProdutoDaPropriaEmpresaDeveRetornar200() throws Exception {
        Produto produto = produtoComId(5L, "Produto", null);
        produto.inativar();
        when(produtoService.inativarParaUsuario(1L, 5L))
                .thenReturn(ProdutoResponse.de(produto, CategoriaArvore.de(List.of())));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/5/inativar").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(false));
    }

    @Test
    void inativarProdutoDeOutraEmpresaDeveRetornar404() throws Exception {
        when(produtoService.inativarParaUsuario(1L, 99L)).thenThrow(new ProdutoNaoEncontradoException());

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/99/inativar").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    @Test
    void reativarProdutoDaPropriaEmpresaDeveRetornar200() throws Exception {
        when(produtoService.reativarParaUsuario(1L, 5L)).thenReturn(respostaComId(5L, "Produto", null));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/5/reativar").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(true));
    }

    @Test
    void reativarProdutoDeOutraEmpresaDeveRetornar404() throws Exception {
        when(produtoService.reativarParaUsuario(1L, 99L)).thenThrow(new ProdutoNaoEncontradoException());

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/99/reativar").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }
}
