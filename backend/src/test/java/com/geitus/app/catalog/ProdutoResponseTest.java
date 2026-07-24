package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.company.Empresa;

/**
 * Testa os derivados margem/markup calculados em {@link ProdutoResponse#de}.
 *
 * <p>markup = (preco - custo) / custo * 100; margem = (preco - custo) / preco * 100.
 * Ambos com 2 casas (HALF_UP) e {@code null} quando o denominador nao permite o
 * calculo (sem custo, custo/preco = 0).
 */
class ProdutoResponseTest {

    private Produto produto(BigDecimal precoVenda, BigDecimal custo) {
        return new Produto(new Empresa("Empresa"), "Produto", null, null, precoVenda,
                custo, null, null, null, null, null, null, null, null);
    }

    @Test
    void comCustoInformadoDeveCalcularMargemEMarkup() {
        ProdutoResponse response = ProdutoResponse.de(produto(new BigDecimal("10.00"), new BigDecimal("8.00")));

        assertThat(response.markup()).isEqualByComparingTo("25.00");
        assertThat(response.margem()).isEqualByComparingTo("20.00");
    }

    @Test
    void semCustoDeveDeixarMargemEMarkupNulos() {
        ProdutoResponse response = ProdutoResponse.de(produto(new BigDecimal("10.00"), null));

        assertThat(response.markup()).isNull();
        assertThat(response.margem()).isNull();
    }

    @Test
    void comCustoZeroDeveDeixarMarkupNuloEMargem100() {
        // Custo 0 evita a divisao por zero do markup; a margem sobre a venda
        // (preco > 0) e 100%.
        ProdutoResponse response = ProdutoResponse.de(produto(new BigDecimal("10.00"), new BigDecimal("0.00")));

        assertThat(response.markup()).isNull();
        assertThat(response.margem()).isEqualByComparingTo("100.00");
    }

    @Test
    void deveMapearOsCamposBrutosDoProduto() {
        // Protege contra regressao silenciosa no mapeamento entidade -> response
        // dos campos da V4 (hoje so os derivados margem/markup eram assertados).
        Produto produto = new Produto(new Empresa("Empresa"), "Arroz 5kg", "Mercearia", "UN",
                new BigDecimal("25.90"), new BigDecimal("18.00"), new BigDecimal("2"), "789100200300",
                "SKU-V4", "Tio João", "Arroz branco tipo 1", new BigDecimal("50.000"),
                new BigDecimal("10.000"), new BigDecimal("20.00"));

        ProdutoResponse response = ProdutoResponse.de(produto);

        assertThat(response.marca()).isEqualTo("Tio João");
        assertThat(response.descricao()).isEqualTo("Arroz branco tipo 1");
        assertThat(response.estoqueMaximo()).isEqualByComparingTo("50.000");
        assertThat(response.pontoReposicao()).isEqualByComparingTo("10.000");
        assertThat(response.precoMinimo()).isEqualByComparingTo("20.00");
    }

    @Test
    void deveArredondarParaDuasCasasComHalfUp() {
        // markup = 1/6 * 100 = 16.6666... -> 16.67; margem = 1/7 * 100 = 14.2857... -> 14.29.
        ProdutoResponse response = ProdutoResponse.de(produto(new BigDecimal("7.00"), new BigDecimal("6.00")));

        assertThat(response.markup()).isEqualByComparingTo("16.67");
        assertThat(response.margem()).isEqualByComparingTo("14.29");
    }
}
