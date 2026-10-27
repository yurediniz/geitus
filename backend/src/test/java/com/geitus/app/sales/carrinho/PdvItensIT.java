package com.geitus.app.sales.carrinho;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.sales.CenarioDoPdv.EmpresaDoPdv;
import com.geitus.app.sales.CenarioDoPdv.NovaEmbalagem;
import com.geitus.app.sales.CenarioDoPdv.NovoProduto;
import com.geitus.app.sales.IntegracaoDoPdv;

/**
 * {@code GET /api/pdv/itens} (docs/modules/pdv.md): codigo do
 * produto, codigo de barras da unidade e da embalagem, etiqueta de balanca,
 * recusas e a busca por nome, sempre na empresa do usuario e sem o custo.
 */
class PdvItensIT extends IntegracaoDoPdv {

    private EmpresaDoPdv empresa;

    @BeforeEach
    void criarEmpresa() {
        empresa = pdv.novaEmpresa();
    }

    @Test
    void unidadePeloCodigoDoProdutoComQuantidade() throws Exception {
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração X 1kg", "UN", "24.90").comCodigo(542)
                .comCusto("15.00").comEstoque("12")
                .comEmbalagens(new NovaEmbalagem("CX", "3", "70.00", List.of()))).id();

        String corpo = resolver(empresa.operadora(), "0542*3")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tipo").value("UNIDADE"))
                .andExpect(jsonPath("$.quantidade").value(3))
                .andExpect(jsonPath("$.codigoLido").value("0542*3"))
                .andExpect(jsonPath("$.embalagemId").value(nullValue()))
                .andExpect(jsonPath("$.produto.id").value(racao.toString()))
                .andExpect(jsonPath("$.produto.codigo").value(542))
                .andExpect(jsonPath("$.produto.unidade").value("UN"))
                .andExpect(jsonPath("$.produto.fracionada").value(false))
                .andExpect(jsonPath("$.produto.controlaEstoque").value(true))
                .andExpect(jsonPath("$.produto.saldo").value(12.0))
                .andExpect(jsonPath("$.produto.precoVigente").value(24.90))
                .andExpect(jsonPath("$.produto.embalagens[0].rotulo").value("CX c/ 3 UN"))
                .andExpect(jsonPath("$.produto.embalagens[0].preco").value(70.0))
                .andReturn().getResponse().getContentAsString();
        assertThat(corpo).doesNotContain("custo").doesNotContain("15.0");
    }

    @Test
    void unidadeEEmbalagemPeloCodigoDeBarras() throws Exception {
        ProdutoResponse nexgard = pdv.produto(empresa, NovoProduto.de("Nexgard", "UN", "89.90")
                .comCodigosBarras("7891234567895")
                .comEmbalagens(new NovaEmbalagem("CX", "3", "209.90", List.of("NEX-CX-3"))));

        resolver(empresa.operadora(), "7891234567895")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tipo").value("UNIDADE"))
                .andExpect(jsonPath("$.quantidade").value(1));
        resolver(empresa.operadora(), "NEX-CX-3*2")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tipo").value("EMBALAGEM"))
                .andExpect(jsonPath("$.quantidade").value(2))
                .andExpect(jsonPath("$.embalagemId").value(nexgard.embalagens().get(0).id().toString()));
        resolver(empresa.operadora(), "NEX-CX-3*1,5")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("CX não aceita quantidade fracionada. Informe um número inteiro."))
                .andExpect(jsonPath("$.campos[0].campo").value("codigo"));
    }

    @Test
    void etiquetaDeBalanca() throws Exception {
        pdv.produto(empresa, NovoProduto.de("Queijo", "KG", "25.00").naBalanca(542));

        resolver(empresa.operadora(), "2000542010000")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tipo").value("ETIQUETA"))
                .andExpect(jsonPath("$.quantidade").value(0.4))
                .andExpect(jsonPath("$.codigoLido").value("2000542010000"))
                .andExpect(jsonPath("$.produto.fracionada").value(true));
    }

    @Test
    void produtoInativo409() throws Exception {
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00").comCodigo(77)).id();
        pdv.inativarProduto(empresa, racao);

        resolver(empresa.operadora(), "77")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Produto inativo — não pode ser vendido."));
    }

    @Test
    void codigoInexistente404() throws Exception {
        resolver(empresa.operadora(), "999")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Código não encontrado."));
        resolver(empresa.operadora(), "ração x").andExpect(status().isNotFound());
    }

    @Test
    void produtoDeOutraEmpresa404() throws Exception {
        EmpresaDoPdv outra = pdv.novaEmpresa();
        pdv.produto(outra, NovoProduto.de("Da outra", "UN", "10.00").comCodigo(123)
                .comCodigosBarras("7891234567895"));

        resolver(empresa.operadora(), "123").andExpect(status().isNotFound());
        resolver(empresa.operadora(), "7891234567895").andExpect(status().isNotFound());
        buscar(empresa.operadora(), "outra").andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void quantidadeInvalida400() throws Exception {
        pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00").comCodigo(542));

        resolver(empresa.operadora(), "542*0,5")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("UN não aceita quantidade fracionada. Informe um número inteiro."));
        resolver(empresa.operadora(), "542*-1")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("A quantidade deve ser maior que zero."));
    }

    @Test
    void semEstoqueComVenderSemEstoqueDesligado409() throws Exception {
        pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00").comCodigo(542).comEstoque("2"));
        resolver(empresa.operadora(), "542*3").andExpect(status().isOk());

        configurarPdv(empresa, false, "10");

        resolver(empresa.operadora(), "542*3")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Estoque insuficiente para Ração (saldo 2 UN)."));
        resolver(empresa.operadora(), "542*2").andExpect(status().isOk());
    }

    @Test
    void buscaSoAtivosAteVinte() throws Exception {
        for (int numero = 1; numero <= 22; numero++) {
            pdv.produto(empresa, NovoProduto.de("Ração sabor " + numero, "UN", "10.00"));
        }
        UUID inativa = pdv.produto(empresa, NovoProduto.de("Ração inativa", "UN", "10.00")).id();
        pdv.inativarProduto(empresa, inativa);
        pdv.produto(empresa, NovoProduto.de("Areia", "UN", "10.00"));

        String corpo = buscar(empresa.operadora(), "racao")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(20)))
                .andExpect(jsonPath("$[*].nome", everyItem(startsWith("Ração sabor"))))
                .andExpect(jsonPath("$[*].id", not(org.hamcrest.Matchers.hasItem(inativa.toString()))))
                .andReturn().getResponse().getContentAsString();
        assertThat(corpo).doesNotContain("custo");
        buscar(empresa.operadora(), "   ").andExpect(jsonPath("$", hasSize(0)));
    }

    /** Etiqueta so de produto vendido na balanca: a de outro produto com o mesmo codigo nao e lida. */
    @Test
    void etiquetaDeProdutoForaDaBalanca404() throws Exception {
        pdv.produto(empresa, NovoProduto.de("Queijo", "KG", "25.00").comCodigo(542));

        resolver(empresa.operadora(), "2000542010000")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Código não encontrado."));
    }

    @Test
    void codigoEBuscaJuntosOuNenhum400() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/pdv/itens")
                        .param("codigo", "542").param("busca", "ração")
                        .header("Authorization", cenario.token(empresa.operadora())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Informe o código ou o texto da busca."));
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/pdv/itens")
                        .header("Authorization", cenario.token(empresa.operadora())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Informe o código ou o texto da busca."));
    }

    @Test
    void codigoLongo400SemRecortar() throws Exception {
        pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00").comCodigosBarras("1".repeat(50)));

        resolver(empresa.operadora(), "1".repeat(50)).andExpect(status().isOk());
        resolver(empresa.operadora(), "1".repeat(61))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("O código lido deve ter até 60 caracteres."))
                .andExpect(jsonPath("$.campos[0].campo").value("codigo"));
        buscar(empresa.operadora(), "r".repeat(101)).andExpect(status().isBadRequest());
    }
}
