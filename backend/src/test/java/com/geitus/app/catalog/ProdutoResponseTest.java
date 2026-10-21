package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;

/**
 * Testa o mapeamento de {@link ProdutoResponse#de}: derivados margem/markup,
 * resumos de unidade/categoria e o texto da conversao de compra.
 *
 * <p>markup = (preco - custo) / custo * 100; margem = (preco - custo) / preco * 100.
 * Ambos com 2 casas (HALF_UP) e {@code null} quando o denominador nao permite o
 * calculo (sem custo, custo/preco = 0).
 */
class ProdutoResponseTest {

    private static final CategoriaArvore SEM_CATEGORIAS = CategoriaArvore.de(List.of());

    private final Empresa empresa = new Empresa("Empresa");
    private final UnidadeMedida un = new UnidadeMedida(empresa, "UN", "Unidade", false);
    private final UnidadeMedida kg = new UnidadeMedida(empresa, "KG", "Quilograma", true);
    private final UnidadeMedida cx = new UnidadeMedida(empresa, "CX", "Caixa", false);
    private final UnidadeMedida fd = new UnidadeMedida(empresa, "FD", "Fardo", false);

    private Produto produto(BigDecimal precoVenda, BigDecimal custo) {
        return new Produto(empresa, "Produto", un, null, null, null, precoVenda,
                custo, null, null, null, null, null, null, null, null);
    }

    private Produto produtoComCompra(UnidadeMedida venda, UnidadeMedida compra, String fator) {
        return new Produto(empresa, "Produto", venda, null, compra, new BigDecimal(fator), new BigDecimal("10.00"),
                null, null, null, null, null, null, null, null, null);
    }

    private static Categoria categoria(Long id, Empresa empresa, Categoria pai, String nome) {
        Categoria categoria = new Categoria(empresa, pai, nome);
        ReflectionTestUtils.setField(categoria, "id", id);
        return categoria;
    }

    @Test
    void comCustoInformadoDeveCalcularMargemEMarkup() {
        ProdutoResponse response = ProdutoResponse.de(produto(new BigDecimal("10.00"), new BigDecimal("8.00")),
                SEM_CATEGORIAS);

        assertThat(response.markup()).isEqualByComparingTo("25.00");
        assertThat(response.margem()).isEqualByComparingTo("20.00");
    }

    @Test
    void semCustoDeveDeixarMargemEMarkupNulos() {
        ProdutoResponse response = ProdutoResponse.de(produto(new BigDecimal("10.00"), null), SEM_CATEGORIAS);

        assertThat(response.markup()).isNull();
        assertThat(response.margem()).isNull();
    }

    @Test
    void comCustoZeroDeveDeixarMarkupNuloEMargem100() {
        // Custo 0 evita a divisao por zero do markup; a margem sobre a venda
        // (preco > 0) e 100%.
        ProdutoResponse response = ProdutoResponse.de(produto(new BigDecimal("10.00"), new BigDecimal("0.00")),
                SEM_CATEGORIAS);

        assertThat(response.markup()).isNull();
        assertThat(response.margem()).isEqualByComparingTo("100.00");
    }

    @Test
    void deveMapearOsCamposBrutosDoProduto() {
        // Protege contra regressao silenciosa no mapeamento entidade -> response
        // dos campos da V4 (hoje so os derivados margem/markup eram assertados).
        Produto produto = new Produto(empresa, "Arroz 5kg", un, null, null, null,
                new BigDecimal("25.90"), new BigDecimal("18.00"), new BigDecimal("2"), "789100200300",
                "SKU-V4", "Tio João", "Arroz branco tipo 1", new BigDecimal("50.000"),
                new BigDecimal("10.000"), new BigDecimal("20.00"));

        ProdutoResponse response = ProdutoResponse.de(produto, SEM_CATEGORIAS);

        assertThat(response.marca()).isEqualTo("Tio João");
        assertThat(response.descricao()).isEqualTo("Arroz branco tipo 1");
        assertThat(response.estoqueMaximo()).isEqualByComparingTo("50.000");
        assertThat(response.pontoReposicao()).isEqualByComparingTo("10.000");
        assertThat(response.precoMinimo()).isEqualByComparingTo("20.00");
    }

    @Test
    void deveArredondarParaDuasCasasComHalfUp() {
        // markup = 1/6 * 100 = 16.6666... -> 16.67; margem = 1/7 * 100 = 14.2857... -> 14.29.
        ProdutoResponse response = ProdutoResponse.de(produto(new BigDecimal("7.00"), new BigDecimal("6.00")),
                SEM_CATEGORIAS);

        assertThat(response.markup()).isEqualByComparingTo("16.67");
        assertThat(response.margem()).isEqualByComparingTo("14.29");
    }

    // ---------- Unidade, categoria e conversao ----------

    @Test
    void unidadeDeVendaSaiComoResumoComUuidPublico() {
        ProdutoResponse response = ProdutoResponse.de(produto(new BigDecimal("10.00"), null), SEM_CATEGORIAS);

        assertThat(response.unidade().id()).isEqualTo(un.getUuid());
        assertThat(response.unidade().sigla()).isEqualTo("UN");
        assertThat(response.unidade().descricao()).isEqualTo("Unidade");
        assertThat(response.unidade().fracionada()).isFalse();
        assertThat(response.categoria()).isNull();
    }

    @Test
    void conversaoTexto() {
        ProdutoResponse caixa = ProdutoResponse.de(produtoComCompra(un, cx, "12"), SEM_CATEGORIAS);
        ProdutoResponse fardo = ProdutoResponse.de(produtoComCompra(kg, fd, "1.5000"), SEM_CATEGORIAS);
        ProdutoResponse semCompra = ProdutoResponse.de(produto(new BigDecimal("10.00"), null), SEM_CATEGORIAS);

        assertThat(caixa.conversaoTexto()).isEqualTo("1 CX = 12 UN");
        assertThat(caixa.unidadeCompra().sigla()).isEqualTo("CX");
        assertThat(caixa.fatorConversao()).isEqualByComparingTo("12");
        assertThat(fardo.conversaoTexto()).isEqualTo("1 FD = 1,5 KG");
        assertThat(semCompra.conversaoTexto()).isNull();
        assertThat(semCompra.unidadeCompra()).isNull();
        assertThat(semCompra.fatorConversao()).isNull();
    }

    @Test
    void conversaoTextoComFatorInteiroDeEscalaQuatroNaoUsaNotacaoCientifica() {
        // 100.0000.stripTrailingZeros() vira 1E+2: o texto deve ser "100".
        ProdutoResponse response = ProdutoResponse.de(produtoComCompra(un, cx, "100.0000"), SEM_CATEGORIAS);

        assertThat(response.conversaoTexto()).isEqualTo("1 CX = 100 UN");
    }

    @Test
    void conversaoTextoComFatorDeMilOuMaisNaoUsaSeparadorDeMilhar() {
        ProdutoResponse fracionado = ProdutoResponse.de(produtoComCompra(un, cx, "1500.5000"), SEM_CATEGORIAS);
        ProdutoResponse mil = ProdutoResponse.de(produtoComCompra(un, cx, "1000.0000"), SEM_CATEGORIAS);

        assertThat(fracionado.conversaoTexto()).isEqualTo("1 CX = 1500,5 UN");
        assertThat(mil.conversaoTexto()).isEqualTo("1 CX = 1000 UN");
    }

    @Test
    void categoriaCaminhoVemDaArvore() {
        Categoria racao = categoria(1L, empresa, null, "Ração");
        Categoria umida = categoria(2L, empresa, racao, "Úmida");
        Categoria sache = categoria(3L, empresa, umida, "Sachê");
        Produto produto = new Produto(empresa, "Sachê de frango", un, sache, null, null, new BigDecimal("3.50"),
                null, null, null, null, null, null, null, null, null);

        ProdutoResponse response = ProdutoResponse.de(produto, CategoriaArvore.de(List.of(racao, umida, sache)));

        assertThat(response.categoria().id()).isEqualTo(sache.getUuid());
        assertThat(response.categoria().nome()).isEqualTo("Sachê");
        assertThat(response.categoria().caminho()).isEqualTo("Ração › Úmida › Sachê");
    }
}
