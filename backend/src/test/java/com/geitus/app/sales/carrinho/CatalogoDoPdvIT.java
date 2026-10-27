package com.geitus.app.sales.carrinho;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import com.geitus.app.sales.CenarioDoPdv.EmpresaDoPdv;
import com.geitus.app.sales.CenarioDoPdv.NovoProduto;
import com.geitus.app.sales.IntegracaoDoPdv;

/**
 * {@code GET /api/pdv/catalogo} (docs/modules/pdv.md; DEC-044): os
 * produtos ativos da empresa, os mais vendidos primeiro (vendas concluidas) e
 * o resto por nome, com o filtro de categoria e a paginacao.
 */
class CatalogoDoPdvIT extends IntegracaoDoPdv {

    private EmpresaDoPdv empresa;

    @BeforeEach
    void criarEmpresa() {
        empresa = pdv.novaEmpresa();
    }

    @Test
    void maisVendidosPrimeiroSemContarCanceladasEDepoisPorNome() throws Exception {
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz 5kg", "UN", "30.00").comCusto("20.00")).id();
        UUID banana = pdv.produto(empresa, NovoProduto.de("Banana", "KG", "6.00")).id();
        UUID cafe = pdv.produto(empresa, NovoProduto.de("Café 500g", "UN", "18.00")).id();
        UUID doce = pdv.produto(empresa, NovoProduto.de("Doce de leite", "UN", "9.00")).id();
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");

        vender(empresa.operadora(), item(cafe, "1"), pagamento("DINHEIRO", "18"), "18.00");
        vender(empresa.operadora(), item(cafe, "1"), pagamento("DINHEIRO", "18"), "18.00");
        // Banana: uma venda, mesmo com quantidade grande (conta a venda, nao o peso).
        vender(empresa.operadora(), item(banana, "10"), pagamento("DINHEIRO", "60"), "60.00");
        // Doce: tres vendas canceladas nao contam.
        for (int vez = 0; vez < 3; vez++) {
            String venda = vender(empresa.operadora(), item(doce, "1"), pagamento("DINHEIRO", "9"), "9.00");
            cancelar(empresa.operadora(), venda, "Desistiu").andExpect(status().isOk());
        }

        String corpo = catalogo(empresa.operadora(), null, 0)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.temMais").value(false))
                .andExpect(jsonPath("$.produtos[*].id", contains(cafe.toString(), banana.toString(),
                        arroz.toString(), doce.toString())))
                .andExpect(jsonPath("$.produtos[0].precoVigente").value(18.0))
                .andReturn().getResponse().getContentAsString();
        assertThat(corpo).doesNotContain("custo");
    }

    @Test
    void vendasDeMaisDe30DiasNaoContam() throws Exception {
        UUID antigo = pdv.produto(empresa, NovoProduto.de("Antigo campeão", "UN", "1.00")).id();
        UUID recente = pdv.produto(empresa, NovoProduto.de("Recente", "UN", "1.00")).id();
        UUID sessao = abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        for (int vez = 0; vez < 3; vez++) {
            pdv.itemVendidoPorJdbc(empresa, sessao, empresa.operadora(), antigo, "1", 31);
        }
        pdv.itemVendidoPorJdbc(empresa, sessao, empresa.operadora(), recente, "1", 29);

        catalogo(empresa.operadora(), null, 0)
                .andExpect(jsonPath("$.produtos[*].id", contains(recente.toString(), antigo.toString())));
    }

    @Test
    void categoriaComAsSubcategoriasSoAtivosESoDaEmpresa() throws Exception {
        UUID racoes = pdv.categoria(empresa, "Rações", null);
        UUID umidas = pdv.categoria(empresa, "Úmidas", racoes);
        UUID bebidas = pdv.categoria(empresa, "Bebidas", null);
        UUID seca = pdv.produto(empresa, NovoProduto.de("Ração seca", "UN", "50.00")).id();
        UUID sache = pdv.produto(empresa, NovoProduto.de("Sachê", "UN", "3.00")).id();
        UUID inativa = pdv.produto(empresa, NovoProduto.de("Ração antiga", "UN", "40.00")).id();
        UUID agua = pdv.produto(empresa, NovoProduto.de("Água", "UN", "2.00")).id();
        pdv.produto(empresa, NovoProduto.de("Sem categoria", "UN", "1.00"));
        pdv.categorizar(seca, racoes);
        pdv.categorizar(sache, umidas);
        pdv.categorizar(inativa, racoes);
        pdv.categorizar(agua, bebidas);
        pdv.inativarProduto(empresa, inativa);

        catalogo(empresa.operadora(), racoes, 0)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.produtos[*].id", containsInAnyOrder(seca.toString(), sache.toString())));
        catalogo(empresa.operadora(), umidas, 0)
                .andExpect(jsonPath("$.produtos[*].id", contains(sache.toString())));
        catalogo(empresa.operadora(), null, 0).andExpect(jsonPath("$.produtos", hasSize(4)));

        EmpresaDoPdv outra = pdv.novaEmpresa();
        UUID daOutra = pdv.categoria(outra, "Rações", null);
        pdv.produto(outra, NovoProduto.de("Da outra empresa", "UN", "1.00"));
        catalogo(empresa.operadora(), daOutra, 0)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.produtos", hasSize(0)))
                .andExpect(jsonPath("$.temMais").value(false));
        catalogo(outra.operadora(), null, 0).andExpect(jsonPath("$.produtos", hasSize(1)));
    }

    @Test
    void paginasDe24() throws Exception {
        for (int numero = 1; numero <= 25; numero++) {
            pdv.produto(empresa, NovoProduto.de(String.format("Produto %02d", numero), "UN", "1.00"));
        }

        catalogo(empresa.operadora(), null, 0)
                .andExpect(jsonPath("$.produtos", hasSize(24)))
                .andExpect(jsonPath("$.produtos[0].nome").value("Produto 01"))
                .andExpect(jsonPath("$.temMais").value(true));
        catalogo(empresa.operadora(), null, 1)
                .andExpect(jsonPath("$.produtos[*].nome", contains("Produto 25")))
                .andExpect(jsonPath("$.temMais").value(false));
    }

    @Test
    void paginaInvalida400() throws Exception {
        catalogo(empresa.operadora(), null, -1)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Página inválida."));
        catalogo(empresa.operadora(), null, 401).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/pdv/catalogo").param("categoria", "nao-e-uuid")
                .header("Authorization", cenario.token(empresa.operadora())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void semTokenRecusado() throws Exception {
        mockMvc.perform(get("/api/pdv/catalogo")).andExpect(status().isUnauthorized());
    }

    private ResultActions catalogo(Long usuario, UUID categoria, int pagina) throws Exception {
        var pedido = get("/api/pdv/catalogo").param("pagina", String.valueOf(pagina))
                .header("Authorization", cenario.token(usuario));
        if (categoria != null) {
            pedido.param("categoria", categoria.toString());
        }
        return mockMvc.perform(pedido);
    }
}
