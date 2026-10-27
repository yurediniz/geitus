package com.geitus.app.sales.carrinho;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
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
 * {@code POST /api/pdv/calculo} (docs/modules/pdv.md): o servidor
 * rele a etiqueta, resolve tudo na empresa do usuario, aplica o limite de
 * desconto pelo perfil do banco e devolve as regras violadas em {@code erros}.
 */
class CalculoIT extends IntegracaoDoPdv {

    private EmpresaDoPdv empresa;

    @BeforeEach
    void criarEmpresa() {
        empresa = pdv.novaEmpresa();
    }

    @Test
    void servidorReleAEtiquetaEIgnoraAQuantidadeEnviada() throws Exception {
        UUID queijo = pdv.produto(empresa, NovoProduto.de("Queijo", "KG", "25.00").naBalanca(542)).id();

        calcular(empresa.operadora(), "{\"itens\":[{\"produtoId\":\"" + queijo + "\",\"quantidade\":99,"
                + "\"codigoLido\":\"2000542010000\",\"etiqueta\":true}]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linhas[0].quantidade").value(0.4))
                .andExpect(jsonPath("$.linhas[0].origemPreco").value("ETIQUETA"))
                .andExpect(jsonPath("$.linhas[0].valorBruto").value(10.0))
                .andExpect(jsonPath("$.total").value(10.0))
                .andExpect(jsonPath("$.erros", hasSize(0)));
    }

    @Test
    void etiquetaDeOutroProduto404() throws Exception {
        pdv.produto(empresa, NovoProduto.de("Queijo", "KG", "25.00").naBalanca(542));
        UUID presunto = pdv.produto(empresa, NovoProduto.de("Presunto", "KG", "30.00").naBalanca(543)).id();

        calcular(empresa.operadora(), "{\"itens\":[{\"produtoId\":\"" + presunto + "\",\"codigoLido\":"
                + "\"2000542010000\",\"etiqueta\":true}]}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.campos[0].campo").value("itens[0]"));
    }

    @Test
    void embalagemRemovida404ItensZero() throws Exception {
        NovoProduto nexgard = NovoProduto.de("Nexgard", "UN", "89.90");
        ProdutoResponse produto = pdv.produto(empresa, nexgard.comEmbalagens(
                new NovaEmbalagem("CX", "3", "209.90", List.of())));
        UUID caixa = produto.embalagens().get(0).id();
        pdv.atualizarProduto(empresa, produto.id(), nexgard);

        calcular(empresa.operadora(), "{\"itens\":[{\"produtoId\":\"" + produto.id() + "\",\"embalagemId\":\""
                + caixa + "\",\"embalagemRotulo\":\"CX c/ 3 UN\",\"quantidade\":1}]}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("A embalagem CX c/ 3 UN não existe mais."))
                .andExpect(jsonPath("$.campos[0].campo").value("itens[0]"));
    }

    @Test
    void produtoInativo409ComCampo() throws Exception {
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "5.00")).id();
        UUID feijao = pdv.produto(empresa, NovoProduto.de("Feijão", "UN", "8.00")).id();
        pdv.inativarProduto(empresa, feijao);

        calcular(empresa.operadora(), "{\"itens\":[" + item(arroz, "1") + "," + item(feijao, "1") + "]}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Produto inativo — não pode ser vendido."))
                .andExpect(jsonPath("$.campos[0].campo").value("itens[1]"));
    }

    @Test
    void produtoDeOutraEmpresa404() throws Exception {
        UUID daOutra = pdv.produto(pdv.novaEmpresa(), NovoProduto.de("Da outra", "UN", "5.00")).id();

        calcular(empresa.operadora(), "{\"itens\":[" + item(daOutra, "1") + "]}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.campos[0].campo").value("itens[0]"));
    }

    @Test
    void clienteInativo404() throws Exception {
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "5.00")).id();
        UUID inativo = pdv.cliente(empresa, "Cliente inativo", false);
        UUID daOutra = pdv.cliente(pdv.novaEmpresa(), "Cliente de outra", true);

        for (UUID cliente : List.of(inativo, daOutra)) {
            calcular(empresa.operadora(), "{\"itens\":[" + item(arroz, "1") + "],\"clienteId\":\"" + cliente + "\"}")
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.mensagem").value("Cliente não encontrado."))
                    .andExpect(jsonPath("$.campos[0].campo").value("clienteId"));
        }
    }

    /** O limite e pelo perfil do banco: mesmo carrinho, erro so para o OPERADOR. */
    @Test
    void operadorEAdminComOMesmoDescontoDeQuinzePorCento() throws Exception {
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "100.00")).id();
        String carrinho = "{\"itens\":[" + item(racao, "1") + "],\"desconto\":{\"tipo\":\"PERCENTUAL\",\"valor\":15}}";

        calcular(empresa.operadora(), carrinho)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.erros[0].campo").value("desconto"))
                .andExpect(jsonPath("$.erros[0].mensagem").value("O desconto passa do limite do operador (10%)."));
        calcular(empresa.admin(), carrinho)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.erros", hasSize(0)))
                .andExpect(jsonPath("$.total").value(85.0));

        Long promovida = cenario.novoUsuario(empresa.caixa(), "Promovida", "ADMIN");
        String tokenDeAdmin = cenario.token(promovida);
        cenario.rebaixarParaOperador(promovida);
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/pdv/calculo")
                        .header("Authorization", tokenDeAdmin)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(carrinho))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.erros[0].campo").value("desconto"));
    }

    /** QA A5: o limite configurado (12,5%) vale no calculo e sai formatado na mensagem. */
    @Test
    void limiteConfiguradoValeNoCalculo() throws Exception {
        configurarPdv(empresa, true, "12.5");
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "100.00")).id();

        calcular(empresa.operadora(), "{\"itens\":[" + item(racao, "1") + "],\"desconto\":{\"tipo\":\"PERCENTUAL\","
                + "\"valor\":12.5}}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.erros", hasSize(0)))
                .andExpect(jsonPath("$.total").value(87.5));
        calcular(empresa.operadora(), "{\"itens\":[" + item(racao, "1") + "],\"desconto\":{\"tipo\":\"PERCENTUAL\","
                + "\"valor\":12.51}}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.erros[0].campo").value("desconto"))
                .andExpect(jsonPath("$.erros[0].mensagem").value("O desconto passa do limite do operador (12,5%)."));
    }

    /** Review Focus 4: o desconto do total ficou maior que o subtotal depois de tirar uma linha. */
    @Test
    void descontoDoTotalMaiorQueOSubtotalNoCampoDesconto() throws Exception {
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();

        calcular(empresa.admin(), "{\"itens\":[" + item(racao, "1") + "],\"desconto\":{\"tipo\":\"VALOR\","
                + "\"valor\":15.00}}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.erros[0].campo").value("desconto"))
                .andExpect(jsonPath("$.erros[0].mensagem").value("O desconto passa do subtotal."))
                .andExpect(jsonPath("$.descontoTotal").value(0.0))
                .andExpect(jsonPath("$.total").value(10.0));
    }

    @Test
    void estoqueInsuficienteEAvisoOuErroPelaConfiguracao() throws Exception {
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00").comEstoque("2")).id();
        String carrinho = "{\"itens\":[" + item(racao, "2") + "," + item(racao, "1") + "]}";

        calcular(empresa.operadora(), carrinho)
                .andExpect(jsonPath("$.erros", hasSize(0)))
                .andExpect(jsonPath("$.avisos[0].campo").value("itens[0]"))
                .andExpect(jsonPath("$.avisos[0].mensagem").value("Estoque insuficiente (saldo 2 UN)."));
        configurarPdv(empresa, false, "10");
        calcular(empresa.operadora(), carrinho)
                .andExpect(jsonPath("$.erros[0].mensagem").value("Estoque insuficiente para Ração (saldo 2 UN)."))
                .andExpect(jsonPath("$.avisos", hasSize(0)));
    }

    @Test
    void pagamentoDivididoComTrocoESemCusto() throws Exception {
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "24.90").comCusto("12.34")).id();

        String corpo = calcular(empresa.operadora(), "{\"itens\":[" + item(racao, "3") + "],\"pagamentos\":["
                + "{\"forma\":\"DINHEIRO\",\"valor\":60},{\"forma\":\"PIX\",\"valor\":20}]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(74.7))
                .andExpect(jsonPath("$.pago").value(80.0))
                .andExpect(jsonPath("$.troco").value(5.3))
                .andExpect(jsonPath("$.faltaPagar").value(0.0))
                .andExpect(jsonPath("$.erros", hasSize(0)))
                .andReturn().getResponse().getContentAsString();
        assertThat(corpo).doesNotContain("custo").doesNotContain("12.34");
    }

    @Test
    void etiquetaDeProdutoForaDaBalanca404ComCampo() throws Exception {
        UUID queijo = pdv.produto(empresa, NovoProduto.de("Queijo", "KG", "25.00").comCodigo(542)).id();

        calcular(empresa.operadora(), "{\"itens\":[{\"produtoId\":\"" + queijo + "\",\"codigoLido\":"
                + "\"2000542010000\",\"etiqueta\":true}]}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Código não encontrado."))
                .andExpect(jsonPath("$.campos[0].campo").value("itens[0]"));
    }

    /**
     * Etiqueta de KG cujo valor deixa a linha abaixo do minimo: o erro sai mesmo sem desconto. O cadastro nao
     * aceita minimo acima do preco; o teste o grava direto no banco.
     */
    @Test
    void etiquetaDeValorAbaixoDoPrecoMinimo() throws Exception {
        UUID queijo = pdv.produto(empresa, NovoProduto.de("Queijo", "KG", "25.00").naBalanca(542)).id();
        jdbcTemplate.update("UPDATE produtos SET preco_minimo = 30.00 WHERE uuid = ?", queijo);

        calcular(empresa.operadora(), "{\"itens\":[" + etiqueta(queijo, "2000542010000") + "]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.erros[0].campo").value("itens[0]"))
                .andExpect(jsonPath("$.erros[0].mensagem").value(
                        "O valor da etiqueta deixa Queijo abaixo do preço mínimo (R$ 30,00 por KG)."));
        resolver(empresa.operadora(), "2000542010000")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("codigo"));
    }

    /** Etiqueta de UN (Racao Gato: normal 10, promocional 9, atacado 8,50 a partir de 3): o preco da unidade. */
    @Test
    void etiquetaDeUnSegueAPromocaoEOAtacado() throws Exception {
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração Gato 1 kg", "UN", "10.00").emPromocao("9.00")
                .comAtacado("8.50", "3").naBalanca(542)).id();
        String etiqueta = etiqueta(racao, "2000542010000");

        calcular(empresa.operadora(), "{\"itens\":[" + etiqueta + "]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.erros", hasSize(0)))
                .andExpect(jsonPath("$.linhas[0].quantidade").value(1.0))
                .andExpect(jsonPath("$.linhas[0].etiqueta").value(true))
                .andExpect(jsonPath("$.linhas[0].origemPreco").value("PROMOCIONAL"))
                .andExpect(jsonPath("$.total").value(9.0));
        calcular(empresa.operadora(), "{\"itens\":[" + etiqueta + "," + etiqueta + "," + item(racao, "1") + "]}")
                .andExpect(jsonPath("$.linhas[*].origemPreco", org.hamcrest.Matchers.everyItem(
                        org.hamcrest.Matchers.is("ATACADO"))))
                .andExpect(jsonPath("$.total").value(25.5));
        calcular(empresa.operadora(), "{\"itens\":[" + etiqueta(racao, "2000542009000") + "]}")
                .andExpect(jsonPath("$.erros[0].campo").value("itens[0]"))
                .andExpect(jsonPath("$.erros[0].mensagem").value(
                        "O valor da etiqueta (R$ 9,00) não confere com o preço de Ração Gato 1 kg (R$ 10,00)."));
        resolver(empresa.operadora(), "2000542010000")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tipo").value("ETIQUETA"))
                .andExpect(jsonPath("$.quantidade").value(1.0));
        resolver(empresa.operadora(), "2000542020000")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value(
                        "O valor da etiqueta (R$ 20,00) não confere com o preço de Ração Gato 1 kg (R$ 10,00)."));
    }

    private static String etiqueta(UUID produto, String codigoLido) {
        return "{\"produtoId\":\"" + produto + "\",\"codigoLido\":\"" + codigoLido + "\",\"etiqueta\":true}";
    }

    /** SEG-1: valor gigante no desconto do item e do total responde rapido, sem travar o servidor. */
    @Test
    void descontoGiganteRecusadoRapido() throws Exception {
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();
        long inicio = System.nanoTime();

        calcular(empresa.operadora(), "{\"itens\":[{\"produtoId\":\"" + racao + "\",\"quantidade\":1,\"desconto\":"
                + "{\"tipo\":\"VALOR\",\"valor\":1E+100000000}}]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("itens[0].desconto.valor"));
        calcular(empresa.operadora(), "{\"itens\":[" + item(racao, "1") + "],\"desconto\":{\"tipo\":\"PERCENTUAL\","
                + "\"valor\":1E+100000000}}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("desconto.valor"));
        calcular(empresa.operadora(), "{\"itens\":[{\"produtoId\":\"" + racao + "\",\"quantidade\":1E+100000000}]}")
                .andExpect(status().isBadRequest());

        assertThat(java.time.Duration.ofNanos(System.nanoTime() - inicio)).isLessThan(java.time.Duration.ofSeconds(5));
    }

    /** R2: etiqueta de produto sem preco nao divide por zero; o erro sai no campo. */
    @Test
    void etiquetaDeProdutoSemPreco() throws Exception {
        UUID brinde = pdv.produto(empresa, NovoProduto.de("Brinde", "KG", "0.00").naBalanca(542)).id();

        calcular(empresa.operadora(), "{\"itens\":[{\"produtoId\":\"" + brinde + "\",\"codigoLido\":"
                + "\"2000542010000\",\"etiqueta\":true}]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.erros[0].campo").value("itens[0]"))
                .andExpect(jsonPath("$.erros[0].mensagem").value("Produto sem preço de venda."))
                .andExpect(jsonPath("$.linhas[0].quantidade").value(0.0))
                .andExpect(jsonPath("$.total").value(0.0));
        resolver(empresa.operadora(), "2000542010000")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Produto sem preço de venda."))
                .andExpect(jsonPath("$.campos[0].campo").value("codigo"));
    }

    @Test
    void codigoLidoLongo400() throws Exception {
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração", "UN", "10.00")).id();

        calcular(empresa.operadora(), "{\"itens\":[{\"produtoId\":\"" + racao + "\",\"quantidade\":1,"
                + "\"codigoLido\":\"" + "7".repeat(61) + "\"}]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("itens[0].codigoLido"));
    }

    @Test
    void corpoMalformado400() throws Exception {
        calcular(empresa.operadora(), "{\"itens\":[{\"quantidade\":1}]}").andExpect(status().isBadRequest());
        calcular(empresa.operadora(), "{\"itens\":null}").andExpect(status().isBadRequest());
        calcular(empresa.operadora(), "{\"itens\":[],\"pagamentos\":[{\"forma\":\"VALE\",\"valor\":1}]}")
                .andExpect(status().isBadRequest());
    }
}
