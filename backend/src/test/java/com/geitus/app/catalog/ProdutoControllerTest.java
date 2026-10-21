package com.geitus.app.catalog;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
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

    private static final LocalDate HOJE = LocalDate.of(2026, 11, 8);
    private static final String NOME_151_CARACTERES = "A".repeat(151);
    private static final UUID PRODUTO_ID = UUID.fromString("00000000-0000-0000-0000-000000000005");
    private static final UUID OUTRO_PRODUTO_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");
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

    private ProdutoResponse respostaComId(UUID id, String nome, String sku) {
        return ProdutoResponse.de(produtoComId(id, nome, sku), CategoriaArvore.de(List.of()), true, HOJE);
    }

    /** Produto com id interno numerico preenchido, para provar que ele nunca sai na resposta. */
    private Produto produtoComId(UUID id, String nome, String sku) {
        Empresa empresa = new Empresa("Empresa 7");
        ReflectionTestUtils.setField(empresa, "id", 7L);
        UnidadeMedida unidade = new UnidadeMedida(empresa, "UN", "Unidade", false);
        Produto produto = ProdutoTesteBuilder.produto(empresa, unidade).id(5L).nome(nome).sku(sku).build();
        ReflectionTestUtils.setField(produto, "uuid", id);
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
        mockMvc.perform(get("/api/produtos/" + PRODUTO_ID))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void atualizarSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(patch("/api/produtos/" + PRODUTO_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto\", \"precoVenda\": 10.00 }"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void inativarSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(patch("/api/produtos/" + PRODUTO_ID + "/inativar"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void reativarSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(patch("/api/produtos/" + PRODUTO_ID + "/reativar"))
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

        mockMvc.perform(patch("/api/produtos/" + PRODUTO_ID)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto\", \"precoVenda\": 10.00 }"))
                .andExpect(status().isForbidden());

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void inativarComPerfilOperadorDeveRetornar403() throws Exception {
        String token = tokenParaUsuarioComPerfil(2L, "OPERADOR");

        mockMvc.perform(patch("/api/produtos/" + PRODUTO_ID + "/inativar").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void reativarComPerfilOperadorDeveRetornar403() throws Exception {
        String token = tokenParaUsuarioComPerfil(2L, "OPERADOR");

        mockMvc.perform(patch("/api/produtos/" + PRODUTO_ID + "/reativar").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    // ---------- Listagem ----------

    @Test
    void listarComTokenValidoDeveRetornarProdutosDaEmpresaDoUsuario() throws Exception {
        when(produtoService.listarParaUsuario(eq(1L), isNull(), isNull()))
                .thenReturn(List.of(respostaComId(PRODUTO_ID, "Arroz 5kg", "SKU-1")));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(PRODUTO_ID.toString()))
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
        when(produtoService.buscarPorIdParaUsuario(1L, PRODUTO_ID)).thenReturn(respostaComId(PRODUTO_ID, "Produto X", null));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos/" + PRODUTO_ID).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(PRODUTO_ID.toString()))
                .andExpect(jsonPath("$.nome").value("Produto X"));
    }

    @Test
    void buscarPorIdDeOutraEmpresaOuInexistenteDeveRetornar404() throws Exception {
        when(produtoService.buscarPorIdParaUsuario(1L, OUTRO_PRODUTO_ID)).thenThrow(new ProdutoNaoEncontradoException());

        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos/" + OUTRO_PRODUTO_ID).header("Authorization", "Bearer " + token))
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
                .thenReturn(respostaComId(PRODUTO_ID, "Produto Novo", "SKU-10"));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto Novo", "10.00")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(PRODUTO_ID.toString()))
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
                .thenThrow(new ProdutoConflitoException("Já existe um produto com este SKU nesta empresa.", "sku"));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00", "\"sku\": \"SKU-1\"")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Já existe um produto com este SKU nesta empresa."))
                .andExpect(jsonPath("$.campos[?(@.campo=='sku')].mensagem")
                        .value("Já existe um produto com este SKU nesta empresa."));
    }

    @Test
    void cadastrarComCodigoBarrasDuplicadoDeveRetornar409() throws Exception {
        when(produtoService.cadastrarParaUsuario(eq(1L), any(ProdutoRequest.class)))
                .thenThrow(new ProdutoConflitoException(
                        "O código de barras 7891000315507 já está cadastrado no produto \"Arroz 5kg\".",
                        "codigosBarras"));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00", "\"codigosBarras\": [\"7891000315507\"]")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem")
                        .value("O código de barras 7891000315507 já está cadastrado no produto \"Arroz 5kg\"."))
                .andExpect(jsonPath("$.campos[?(@.campo=='codigosBarras')].mensagem")
                        .value("O código de barras 7891000315507 já está cadastrado no produto \"Arroz 5kg\"."));
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
                .andExpect(jsonPath("$.mensagem").value("Informe a unidade de compra e o fator de conversão juntos."))
                .andExpect(jsonPath("$.campos").doesNotExist());
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
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).id(5L).nome("Sachê").categoria(umida)
                .compra(cx, "12.0000").precoVenda("3.50").build();
        when(produtoService.buscarPorIdParaUsuario(1L, produto.getUuid()))
                .thenReturn(ProdutoResponse.de(produto, CategoriaArvore.de(List.of(racao, umida)), true, HOJE));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos/" + produto.getUuid()).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(produto.getUuid().toString()))
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
        when(produtoService.atualizarDadosBasicosParaUsuario(eq(1L), eq(PRODUTO_ID), any(ProdutoRequest.class)))
                .thenReturn(respostaComId(PRODUTO_ID, "Produto Atualizado", null));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/" + PRODUTO_ID)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto Atualizado", "15.00")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nome").value("Produto Atualizado"));
    }

    @Test
    void atualizarProdutoDeOutraEmpresaDeveRetornar404() throws Exception {
        when(produtoService.atualizarDadosBasicosParaUsuario(eq(1L), eq(OUTRO_PRODUTO_ID), any(ProdutoRequest.class)))
                .thenThrow(new ProdutoNaoEncontradoException());

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/" + OUTRO_PRODUTO_ID)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00")))
                .andExpect(status().isNotFound());
    }

    @Test
    void atualizarComSkuDuplicadoDeOutroProdutoDeveRetornar409() throws Exception {
        when(produtoService.atualizarDadosBasicosParaUsuario(eq(1L), eq(PRODUTO_ID), any(ProdutoRequest.class)))
                .thenThrow(new ProdutoConflitoException("Já existe um produto com este SKU nesta empresa.", "sku"));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/" + PRODUTO_ID)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00", "\"sku\": \"SKU-DE-OUTRO\"")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.campos[?(@.campo=='sku')]").exists());
    }

    @Test
    void atualizarMantendoOProprioSkuDeveRetornar200() throws Exception {
        when(produtoService.atualizarDadosBasicosParaUsuario(eq(1L), eq(PRODUTO_ID), any(ProdutoRequest.class)))
                .thenReturn(respostaComId(PRODUTO_ID, "Produto", "SKU-PROPRIO"));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/" + PRODUTO_ID)
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

        mockMvc.perform(patch("/api/produtos/" + PRODUTO_ID)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo))
                .andExpect(status().isBadRequest());
    }

    // ---------- Inativar / reativar ----------

    @Test
    void inativarProdutoDaPropriaEmpresaDeveRetornar200() throws Exception {
        Produto produto = produtoComId(PRODUTO_ID, "Produto", null);
        produto.inativar();
        when(produtoService.inativarParaUsuario(1L, PRODUTO_ID))
                .thenReturn(ProdutoResponse.de(produto, CategoriaArvore.de(List.of()), true, HOJE));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/" + PRODUTO_ID + "/inativar").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(false));
    }

    @Test
    void inativarProdutoDeOutraEmpresaDeveRetornar404() throws Exception {
        when(produtoService.inativarParaUsuario(1L, OUTRO_PRODUTO_ID)).thenThrow(new ProdutoNaoEncontradoException());

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/" + OUTRO_PRODUTO_ID + "/inativar").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    @Test
    void reativarProdutoDaPropriaEmpresaDeveRetornar200() throws Exception {
        when(produtoService.reativarParaUsuario(1L, PRODUTO_ID)).thenReturn(respostaComId(PRODUTO_ID, "Produto", null));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/" + PRODUTO_ID + "/reativar").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(true));
    }

    @Test
    void reativarProdutoDeOutraEmpresaDeveRetornar404() throws Exception {
        when(produtoService.reativarParaUsuario(1L, OUTRO_PRODUTO_ID)).thenThrow(new ProdutoNaoEncontradoException());

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/" + OUTRO_PRODUTO_ID + "/reativar").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    // ---------- Fase B: UUID publico ----------

    @Test
    void idNumericoAntigoNaRotaRetorna400() throws Exception {
        // As rotas passaram a usar o UUID publico: o id numerico nao e aceito.
        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos/5").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Identificador inválido."));

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void respostaNaoTemIdNumericoNemNoProdutoNemNosCodigos() throws Exception {
        Empresa empresa = new Empresa("Empresa 7");
        ReflectionTestUtils.setField(empresa, "id", 7L);
        UnidadeMedida un = new UnidadeMedida(empresa, "UN", "Unidade", false);
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).id(5L)
                .nome("Ração Golden Adulto Frango e Arroz 15kg").fornecedor("Distribuidora X")
                .codigo("7891000315507").codigo("ABC-1").build();
        ReflectionTestUtils.setField(produto.getCodigosBarras().get(0), "id", 77L);
        when(produtoService.buscarPorIdParaUsuario(1L, produto.getUuid()))
                .thenReturn(ProdutoResponse.de(produto, CategoriaArvore.de(List.of()), true, HOJE));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos/" + produto.getUuid()).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(produto.getUuid().toString()))
                .andExpect(jsonPath("$.nomeCurto").doesNotExist())
                .andExpect(jsonPath("$.nomeCurtoEfetivo").value("Ração Golden Adulto Frango e A"))
                .andExpect(jsonPath("$.fornecedor").value("Distribuidora X"))
                .andExpect(jsonPath("$.podeExcluir").value(true))
                .andExpect(jsonPath("$.codigosBarras[0].codigo").value("7891000315507"))
                .andExpect(jsonPath("$.codigosBarras[0].formato").value("EAN13"))
                .andExpect(jsonPath("$.codigosBarras[0].id").doesNotExist())
                .andExpect(jsonPath("$.codigosBarras[1].formato").value("OUTRO"))
                .andExpect(jsonPath("$.codigoBarras").doesNotExist())
                .andExpect(jsonPath("$.empresaId").doesNotExist());
    }

    // ---------- Fase B: validacao do request ----------

    @Test
    void codigosBarrasCom21ItensRetorna400ComOCampo() throws Exception {
        String token = tokenParaUsuario(1L);
        StringBuilder lista = new StringBuilder("[");
        for (int numero = 1; numero <= 21; numero++) {
            lista.append(numero == 1 ? "" : ", ").append("\"COD-").append(numero).append('"');
        }
        lista.append(']');

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00", "\"codigosBarras\": " + lista)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='codigosBarras')].mensagem")
                        .value("Informe no máximo 20 códigos de barras."));

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void codigoComMaisDe50CaracteresENomeCurtoComMaisDe30Retornam400() throws Exception {
        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00", "\"codigosBarras\": [\"" + "9".repeat(51) + "\"]",
                                "\"nomeCurto\": \"" + "N".repeat(31) + "\"")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='codigosBarras[0]')]").exists())
                .andExpect(jsonPath("$.campos[?(@.campo=='nomeCurto')]").exists());

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void codigoComDigitoInvalidoRetorna400ComMensagemDoService() throws Exception {
        String mensagem = "Código de barras 7891000315508 com dígito verificador inválido. Confira a leitura.";
        when(produtoService.cadastrarParaUsuario(eq(1L), any(ProdutoRequest.class)))
                .thenThrow(new RegraDeNegocioException(mensagem, "codigosBarras"));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00", "\"codigosBarras\": [\"7891000315508\"]")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value(mensagem))
                .andExpect(jsonPath("$.campos[?(@.campo=='codigosBarras')].mensagem").value(mensagem));

        ArgumentCaptor<ProdutoRequest> request = ArgumentCaptor.forClass(ProdutoRequest.class);
        org.mockito.Mockito.verify(produtoService).cadastrarParaUsuario(eq(1L), request.capture());
        org.assertj.core.api.Assertions.assertThat(request.getValue().codigosBarras())
                .containsExactly("7891000315508");
    }

    // ---------- Fase B: exclusao ----------

    @Test
    void excluirComAdminRetorna204() throws Exception {
        String token = tokenParaUsuario(1L);

        mockMvc.perform(delete("/api/produtos/" + PRODUTO_ID).header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());

        org.mockito.Mockito.verify(produtoService).excluirParaUsuario(1L, PRODUTO_ID);
    }

    @Test
    void excluirComOperadorRetorna403() throws Exception {
        String token = tokenParaUsuarioComPerfil(2L, "OPERADOR");

        mockMvc.perform(delete("/api/produtos/" + PRODUTO_ID).header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void excluirSemTokenRetorna401() throws Exception {
        mockMvc.perform(delete("/api/produtos/" + PRODUTO_ID))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void excluirDeOutraEmpresaRetorna404() throws Exception {
        org.mockito.Mockito.doThrow(new ProdutoNaoEncontradoException())
                .when(produtoService).excluirParaUsuario(1L, OUTRO_PRODUTO_ID);

        String token = tokenParaUsuario(1L);

        mockMvc.perform(delete("/api/produtos/" + OUTRO_PRODUTO_ID).header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }

    @Test
    void excluirBloqueadoRetorna409ComMensagem() throws Exception {
        String mensagem = "Este produto já teve movimentação e não pode ser excluído. "
                + "Inative-o para que não apareça na venda.";
        org.mockito.Mockito.doThrow(new ProdutoConflitoException(mensagem))
                .when(produtoService).excluirParaUsuario(1L, PRODUTO_ID);

        String token = tokenParaUsuario(1L);

        mockMvc.perform(delete("/api/produtos/" + PRODUTO_ID).header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(mensagem))
                .andExpect(jsonPath("$.campos").doesNotExist());
    }

    // ---------- Fase B: SKU sugerido e sugestoes ----------

    @Test
    void sugestaoDeSkuComAdminRetorna200() throws Exception {
        when(produtoService.sugerirSkuParaUsuario(1L)).thenReturn("P000031");

        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos/sku/sugestao").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sku").value("P000031"));
    }

    @Test
    void sugestaoDeSkuComOperadorRetorna403() throws Exception {
        String token = tokenParaUsuarioComPerfil(2L, "OPERADOR");

        mockMvc.perform(get("/api/produtos/sku/sugestao").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void sugestoesDeMarcaComOperadorRetorna200() throws Exception {
        when(produtoService.sugestoesParaUsuario(2L, "marca", "gol")).thenReturn(List.of("Golden", "Gold Pet"));

        String token = tokenParaUsuarioComPerfil(2L, "OPERADOR");

        mockMvc.perform(get("/api/produtos/sugestoes").param("campo", "marca").param("termo", "gol")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0]").value("Golden"))
                .andExpect(jsonPath("$[1]").value("Gold Pet"));
    }

    @Test
    void sugestoesComCampoInvalidoRetorna400() throws Exception {
        when(produtoService.sugestoesParaUsuario(1L, "x", null))
                .thenThrow(new RegraDeNegocioException("Campo de sugestão inválido."));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(get("/api/produtos/sugestoes").param("campo", "x").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Campo de sugestão inválido."));
    }

    @Test
    void sugestoesSemTokenRetorna401() throws Exception {
        mockMvc.perform(get("/api/produtos/sugestoes").param("campo", "marca"))
                .andExpect(status().isUnauthorized());
    }

    // ---------- Fase C: promocao e atacado (Bean Validation aninhada) ----------

    @Test
    void promocaoSemInicio_400ComCampoPromocaoInicio() throws Exception {
        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00",
                                "\"promocao\": { \"preco\": 8.90, \"fim\": \"2026-11-15\" }")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='promocao.inicio')].mensagem")
                        .value("Informe o início da promoção."));

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void atacadoComCasasDemais_400NosCamposDoAtacado() throws Exception {
        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00",
                                "\"atacado\": { \"preco\": 4.205, \"quantidadeMinima\": 2.5005 }")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[?(@.campo=='atacado.preco')]").exists())
                .andExpect(jsonPath("$.campos[?(@.campo=='atacado.quantidadeMinima')]").exists());

        org.mockito.Mockito.verifyNoInteractions(produtoService);
    }

    @Test
    void promocaoEAtacadoChegamAoServiceERespostaTrazOsBlocos() throws Exception {
        Produto produto = ProdutoTesteBuilder.produto(new Empresa("Empresa 7"),
                        new UnidadeMedida(new Empresa("Empresa 7"), "UN", "Unidade", false))
                .promocao("8.90", LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 15)).atacado("4.20", "12").build();
        when(produtoService.cadastrarParaUsuario(eq(1L), any(ProdutoRequest.class)))
                .thenReturn(ProdutoResponse.de(produto, CategoriaArvore.de(List.of()), true, HOJE));

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + tokenParaUsuario(1L))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo("Produto", "10.00",
                                "\"promocao\": { \"preco\": 8.90, \"inicio\": \"2026-11-01\", \"fim\": \"2026-11-15\" }",
                                "\"atacado\": { \"preco\": 4.20, \"quantidadeMinima\": 12 }")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.promocao.preco").value(8.90))
                .andExpect(jsonPath("$.promocao.inicio").value("2026-11-01"))
                .andExpect(jsonPath("$.promocao.situacao").value("VIGENTE"))
                .andExpect(jsonPath("$.emPromocao").value(true))
                .andExpect(jsonPath("$.atacado.quantidadeMinima").value(12));

        ArgumentCaptor<ProdutoRequest> request = ArgumentCaptor.forClass(ProdutoRequest.class);
        org.mockito.Mockito.verify(produtoService).cadastrarParaUsuario(eq(1L), request.capture());
        org.assertj.core.api.Assertions.assertThat(request.getValue().promocao().inicio())
                .isEqualTo(LocalDate.of(2026, 11, 1));
        org.assertj.core.api.Assertions.assertThat(request.getValue().atacado().quantidadeMinima())
                .isEqualByComparingTo("12");
    }
}
