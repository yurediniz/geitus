package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;

/**
 * Origem do custo do produto (Fase B4, docs/modules/produtos-custo-entrada.md,
 * 4): a entrada por compra define o custo e marca {@code ENTRADA_COMPRA}; a
 * edicao marca {@code EDICAO}; sem custo, sem origem.
 */
class ProdutoOrigemDoCustoTest {

    private static final LocalDateTime AGORA = LocalDateTime.of(2026, 10, 24, 14, 30);

    private final Empresa empresa = new Empresa("Empresa");
    private final UnidadeMedida un = new UnidadeMedida(empresa, "UN", "Unidade", false);

    @Test
    void entradaDeCompraDefineOCustoEAOrigem() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).custo("9.50").build();

        produto.registrarCustoDeEntrada(new BigDecimal("10.00"), AGORA);

        assertThat(produto.getCusto()).isEqualByComparingTo("10.00");
        assertThat(produto.getCustoOrigem()).isEqualTo(OrigemDoCusto.ENTRADA_COMPRA);
        assertThat(produto.getCustoOrigemEm()).isEqualTo(AGORA);
    }

    @Test
    void edicaoMarcaAOrigemEdicao() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).custo("9.50").build();
        produto.registrarCustoDeEntrada(new BigDecimal("10.00"), AGORA.minusDays(1));

        produto.marcarCustoEditado(AGORA);

        assertThat(produto.getCustoOrigem()).isEqualTo(OrigemDoCusto.EDICAO);
        assertThat(produto.getCustoOrigemEm()).isEqualTo(AGORA);
    }

    @Test
    void edicaoQueApagaOCustoLimpaAOrigem() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).custo("9.50").build();
        produto.registrarCustoDeEntrada(new BigDecimal("10.00"), AGORA.minusDays(1));
        produto.atualizarDadosBasicos(ProdutoTesteBuilder.produto(empresa, un).dados());

        produto.marcarCustoEditado(AGORA);

        assertThat(produto.getCusto()).isNull();
        assertThat(produto.getCustoOrigem()).isNull();
        assertThat(produto.getCustoOrigemEm()).isNull();
    }

    @Test
    void produtoNovoNaoTemOrigem() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, un).custo("9.50").build();

        assertThat(produto.getCustoOrigem()).isNull();
        assertThat(produto.getCustoOrigemEm()).isNull();
    }
}
