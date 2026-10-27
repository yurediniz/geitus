package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;

/**
 * Regra do preco aplicado na venda (docs/modules/produtos.md):
 * candidatos normal, promocional vigente e atacado atingido; vence o menor,
 * empate entre promocional e atacado da {@code PROMOCIONAL}.
 *
 * <p>Cenario base: preco de venda 10,00; promocao 8,90 de 01/11 a 15/11/2026;
 * atacado 8,50 a partir de 12.
 */
class PrecoDeVendaTest {

    private static final LocalDate INICIO = LocalDate.of(2026, 11, 1);
    private static final LocalDate FIM = LocalDate.of(2026, 11, 15);
    private static final LocalDate DURANTE = LocalDate.of(2026, 11, 8);
    private static final BigDecimal UMA_UNIDADE = BigDecimal.ONE;
    private static final BigDecimal MINIMO_ATACADO = new BigDecimal("12");

    private final Empresa empresa = new Empresa("Empresa");
    private final UnidadeMedida un = new UnidadeMedida(empresa, "UN", "Unidade", false);

    private ProdutoTesteBuilder produto() {
        return ProdutoTesteBuilder.produto(empresa, un).precoVenda("10.00");
    }

    private ProdutoTesteBuilder comPromocao(String preco) {
        return produto().promocao(preco, INICIO, FIM);
    }

    @Test
    void semPromocaoNemAtacado_normal() {
        PrecoAplicado aplicado = PrecoDeVenda.resolver(produto().build(), MINIMO_ATACADO, DURANTE);

        assertThat(aplicado).isEqualTo(new PrecoAplicado(new BigDecimal("10.00"), OrigemPreco.NORMAL));
    }

    @Test
    void promocaoNoPrimeiroEUltimoDia_promocional() {
        Produto produto = comPromocao("8.90").build();

        assertThat(PrecoDeVenda.resolver(produto, UMA_UNIDADE, INICIO))
                .as("preserva o valor gravado, sem reescalar")
                .isEqualTo(new PrecoAplicado(new BigDecimal("8.90"), OrigemPreco.PROMOCIONAL));
        assertThat(PrecoDeVenda.resolver(produto, UMA_UNIDADE, FIM))
                .isEqualTo(new PrecoAplicado(new BigDecimal("8.90"), OrigemPreco.PROMOCIONAL));
    }

    @Test
    void promocaoUmDiaAntesEUmDepois_normal() {
        Produto produto = comPromocao("8.90").build();

        assertThat(PrecoDeVenda.resolver(produto, UMA_UNIDADE, INICIO.minusDays(1)).origem())
                .isEqualTo(OrigemPreco.NORMAL);
        assertThat(PrecoDeVenda.resolver(produto, UMA_UNIDADE, FIM.plusDays(1)).origem())
                .isEqualTo(OrigemPreco.NORMAL);
    }

    @Test
    void quantidadeNoMinimo_atacado() {
        Produto produto = produto().atacado("8.50", "12").build();

        assertThat(PrecoDeVenda.resolver(produto, MINIMO_ATACADO, DURANTE))
                .isEqualTo(new PrecoAplicado(new BigDecimal("8.50"), OrigemPreco.ATACADO));
        assertThat(PrecoDeVenda.resolver(produto, new BigDecimal("12.000"), DURANTE).origem())
                .as("comparacao numerica: 12.000 = 12").isEqualTo(OrigemPreco.ATACADO);
    }

    @Test
    void quantidadeAbaixoDoMinimo_normal() {
        Produto produto = produto().atacado("8.50", "12").build();

        assertThat(PrecoDeVenda.resolver(produto, new BigDecimal("11.999"), DURANTE))
                .isEqualTo(new PrecoAplicado(new BigDecimal("10.00"), OrigemPreco.NORMAL));
    }

    @Test
    void promocaoEAtacado_menorVence() {
        Produto atacadoMenor = comPromocao("8.90").atacado("8.50", "12").build();
        Produto promocaoMenor = comPromocao("8.00").atacado("8.50", "12").build();

        assertThat(PrecoDeVenda.resolver(atacadoMenor, MINIMO_ATACADO, DURANTE))
                .isEqualTo(new PrecoAplicado(new BigDecimal("8.50"), OrigemPreco.ATACADO));
        assertThat(PrecoDeVenda.resolver(promocaoMenor, MINIMO_ATACADO, DURANTE))
                .isEqualTo(new PrecoAplicado(new BigDecimal("8.00"), OrigemPreco.PROMOCIONAL));
        assertThat(PrecoDeVenda.resolver(atacadoMenor, UMA_UNIDADE, DURANTE))
                .as("abaixo do minimo do atacado, so a promocao concorre")
                .isEqualTo(new PrecoAplicado(new BigDecimal("8.90"), OrigemPreco.PROMOCIONAL));
    }

    @Test
    void empateEntrePromocaoEAtacado_promocional() {
        Produto produto = comPromocao("8.50").atacado("8.5", "12").build();

        assertThat(PrecoDeVenda.resolver(produto, MINIMO_ATACADO, DURANTE))
                .isEqualTo(new PrecoAplicado(new BigDecimal("8.50"), OrigemPreco.PROMOCIONAL));
    }

    @Test
    void quantidadeZeroOuNegativa_lancaIllegalArgument() {
        Produto produto = produto().build();

        assertThatThrownBy(() -> PrecoDeVenda.resolver(produto, BigDecimal.ZERO, DURANTE))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PrecoDeVenda.resolver(produto, new BigDecimal("-1"), DURANTE))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> PrecoDeVenda.resolver(produto, null, DURANTE))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
