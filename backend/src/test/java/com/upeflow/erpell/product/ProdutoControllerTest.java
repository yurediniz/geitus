package com.upeflow.erpell.product;

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

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import com.upeflow.erpell.auth.JwtAuthenticationFilter;
import com.upeflow.erpell.auth.JwtService;
import com.upeflow.erpell.company.Empresa;
import com.upeflow.erpell.config.RestAccessDeniedHandler;
import com.upeflow.erpell.config.RestAuthenticationEntryPoint;
import com.upeflow.erpell.config.SecurityConfig;
import com.upeflow.erpell.shared.error.GlobalExceptionHandler;
import com.upeflow.erpell.user.Usuario;

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

    private Produto produtoComId(Long id, Long empresaId, String nome, String sku) {
        Empresa empresa = new Empresa("Empresa " + empresaId);
        ReflectionTestUtils.setField(empresa, "id", empresaId);
        Produto produto = new Produto(empresa, nome, new BigDecimal("10.00"));
        ReflectionTestUtils.setField(produto, "id", id);
        produto.setSku(sku);
        return produto;
    }

    private String tokenParaUsuario(Long idUsuario) {
        Usuario usuario = org.mockito.Mockito.mock(Usuario.class);
        when(usuario.getId()).thenReturn(idUsuario);
        when(usuario.getPerfil()).thenReturn("ADMIN");
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

    // ---------- Listagem ----------

    @Test
    void listarComTokenValidoDeveRetornarProdutosDaEmpresaDoUsuario() throws Exception {
        Produto produto = produtoComId(1L, 7L, "Arroz 5kg", "SKU-1");
        when(produtoService.listarParaUsuario(eq(1L), isNull(), isNull())).thenReturn(List.of(produto));

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
        Produto produto = produtoComId(5L, 7L, "Produto X", null);
        when(produtoService.buscarPorIdParaUsuario(1L, 5L)).thenReturn(produto);

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

    // ---------- Cadastro ----------

    @Test
    void cadastrarProdutoValidoDeveRetornar201() throws Exception {
        Produto produto = produtoComId(10L, 7L, "Produto Novo", "SKU-10");
        when(produtoService.cadastrarParaUsuario(eq(1L), eq("Produto Novo"), isNull(), isNull(),
                eq(new BigDecimal("10.00")), isNull(), isNull(), isNull(), isNull()))
                .thenReturn(produto);

        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto Novo\", \"precoVenda\": 10.00 }"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(10))
                .andExpect(jsonPath("$.nome").value("Produto Novo"));
    }

    @Test
    void cadastrarComNomeVazioDeveRetornar400() throws Exception {
        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"\", \"precoVenda\": 10.00 }"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos").isArray());
    }

    @Test
    void cadastrarComPrecoVendaNegativoDeveRetornar400() throws Exception {
        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto\", \"precoVenda\": -1.00 }"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cadastrarComSkuDuplicadoDeveRetornar400() throws Exception {
        when(produtoService.cadastrarParaUsuario(eq(1L), eq("Produto"), isNull(), isNull(),
                eq(new BigDecimal("10.00")), isNull(), isNull(), isNull(), eq("SKU-1")))
                .thenThrow(new RegraDeNegocioException("Já existe um produto com este SKU nesta empresa."));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto\", \"precoVenda\": 10.00, \"sku\": \"SKU-1\" }"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Já existe um produto com este SKU nesta empresa."));
    }

    @Test
    void cadastrarComNomeAcimaDoTamanhoMaximoDeveRetornar400() throws Exception {
        String token = tokenParaUsuario(1L);

        String corpo = "{ \"nome\": \"" + NOME_151_CARACTERES + "\", \"precoVenda\": 10.00 }";

        mockMvc.perform(post("/api/produtos")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo))
                .andExpect(status().isBadRequest());
    }

    // ---------- Atualizacao ----------

    @Test
    void atualizarProdutoDaPropriaEmpresaDeveRetornar200() throws Exception {
        Produto produto = produtoComId(5L, 7L, "Produto Atualizado", null);
        when(produtoService.atualizarDadosBasicosParaUsuario(eq(1L), eq(5L), eq("Produto Atualizado"), isNull(),
                isNull(), eq(new BigDecimal("15.00")), isNull(), isNull(), isNull(), isNull()))
                .thenReturn(produto);

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/5")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto Atualizado\", \"precoVenda\": 15.00 }"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nome").value("Produto Atualizado"));
    }

    @Test
    void atualizarProdutoDeOutraEmpresaDeveRetornar404() throws Exception {
        when(produtoService.atualizarDadosBasicosParaUsuario(eq(1L), eq(99L), eq("Produto"), isNull(), isNull(),
                eq(new BigDecimal("10.00")), isNull(), isNull(), isNull(), isNull()))
                .thenThrow(new ProdutoNaoEncontradoException());

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/99")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto\", \"precoVenda\": 10.00 }"))
                .andExpect(status().isNotFound());
    }

    @Test
    void atualizarComSkuDuplicadoDeOutroProdutoDeveRetornar400() throws Exception {
        when(produtoService.atualizarDadosBasicosParaUsuario(eq(1L), eq(5L), eq("Produto"), isNull(), isNull(),
                eq(new BigDecimal("10.00")), isNull(), isNull(), isNull(), eq("SKU-DE-OUTRO")))
                .thenThrow(new RegraDeNegocioException("Já existe um produto com este SKU nesta empresa."));

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/5")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto\", \"precoVenda\": 10.00, \"sku\": \"SKU-DE-OUTRO\" }"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void atualizarMantendoOProprioSkuDeveRetornar200() throws Exception {
        Produto produto = produtoComId(5L, 7L, "Produto", "SKU-PROPRIO");
        when(produtoService.atualizarDadosBasicosParaUsuario(eq(1L), eq(5L), eq("Produto"), isNull(), isNull(),
                eq(new BigDecimal("10.00")), isNull(), isNull(), isNull(), eq("SKU-PROPRIO")))
                .thenReturn(produto);

        String token = tokenParaUsuario(1L);

        mockMvc.perform(patch("/api/produtos/5")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"nome\": \"Produto\", \"precoVenda\": 10.00, \"sku\": \"SKU-PROPRIO\" }"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sku").value("SKU-PROPRIO"));
    }

    @Test
    void atualizarComNomeAcimaDoTamanhoMaximoDeveRetornar400() throws Exception {
        String token = tokenParaUsuario(1L);

        String corpo = "{ \"nome\": \"" + NOME_151_CARACTERES + "\", \"precoVenda\": 10.00 }";

        mockMvc.perform(patch("/api/produtos/5")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(corpo))
                .andExpect(status().isBadRequest());
    }

    // ---------- Inativar / reativar ----------

    @Test
    void inativarProdutoDaPropriaEmpresaDeveRetornar200() throws Exception {
        Produto produto = produtoComId(5L, 7L, "Produto", null);
        produto.inativar();
        when(produtoService.inativarParaUsuario(1L, 5L)).thenReturn(produto);

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
        Produto produto = produtoComId(5L, 7L, "Produto", null);
        when(produtoService.reativarParaUsuario(1L, 5L)).thenReturn(produto);

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
