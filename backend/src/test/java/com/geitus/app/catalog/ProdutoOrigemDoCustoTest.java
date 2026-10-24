package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;

/**
 * Origem do custo do produto (Fase B4, docs/modules/produtos-custo-entrada.md,
 * 4), mantida pela propria entidade: a entrada por compra define o custo e
 * marca {@code ENTRADA_COMPRA}; o cadastro ou a edicao que muda o custo marca
 * {@code EDICAO}; o mesmo custo mantem a origem; sem custo, sem origem.
 */
class ProdutoOrigemDoCustoTest {

    private static final LocalDateTime ONTEM = LocalDateTime.of(2026, 10, 23, 9, 0);
    private static final LocalDateTime AGORA = LocalDateTime.of(2026, 10, 24, 14, 30);

    private final Empresa empresa = new Empresa("Empresa");
    private final UnidadeMedida un = new UnidadeMedida(empresa, "UN", "Unidade", false);

    private DadosProduto dadosComCusto(String custo) {
        return ProdutoTesteBuilder.produto(empresa, un).custo(custo).dados();
    }

    private Produto compradoA(String custo) {
        Produto produto = new Produto(empresa, 1L, dadosComCusto(null), ONTEM);
        produto.registrarCustoDeEntrada(new BigDecimal(custo), ONTEM);
        return produto;
    }

    @Test
    void cadastroComCustoMarcaEdicao() {
        Produto produto = new Produto(empresa, 1L, dadosComCusto("9.50"), AGORA);

        assertThat(produto.getCustoOrigem()).isEqualTo(OrigemDoCusto.EDICAO);
        assertThat(produto.getCustoOrigemEm()).isEqualTo(AGORA);
    }

    @Test
    void cadastroSemCustoNaoTemOrigem() {
        Produto produto = new Produto(empresa, 1L, dadosComCusto(null), AGORA);

        assertThat(produto.getCustoOrigem()).isNull();
        assertThat(produto.getCustoOrigemEm()).isNull();
    }

    @Test
    void entradaDeCompraDefineOCustoEAOrigem() {
        Produto produto = new Produto(empresa, 1L, dadosComCusto("9.50"), ONTEM);

        produto.registrarCustoDeEntrada(new BigDecimal("10.00"), AGORA);

        assertThat(produto.getCusto()).isEqualByComparingTo("10.00");
        assertThat(produto.getCustoOrigem()).isEqualTo(OrigemDoCusto.ENTRADA_COMPRA);
        assertThat(produto.getCustoOrigemEm()).isEqualTo(AGORA);
    }

    @Test
    void edicaoQueMudaOCustoMarcaEdicao() {
        Produto produto = compradoA("10.00");

        produto.atualizarDadosBasicos(dadosComCusto("10.50"), AGORA);

        assertThat(produto.getCustoOrigem()).isEqualTo(OrigemDoCusto.EDICAO);
        assertThat(produto.getCustoOrigemEm()).isEqualTo(AGORA);
    }

    /** Review Focus 2: salvar com o mesmo custo (10 = 10,00) mantem a origem e a data da compra. */
    @Test
    void edicaoComOMesmoCustoMantemAOrigem() {
        Produto produto = compradoA("10.00");

        produto.atualizarDadosBasicos(dadosComCusto("10"), AGORA);

        assertThat(produto.getCustoOrigem()).isEqualTo(OrigemDoCusto.ENTRADA_COMPRA);
        assertThat(produto.getCustoOrigemEm()).isEqualTo(ONTEM);
    }

    @Test
    void edicaoQueApagaOCustoLimpaAOrigem() {
        Produto produto = compradoA("10.00");

        produto.atualizarDadosBasicos(dadosComCusto(null), AGORA);

        assertThat(produto.getCusto()).isNull();
        assertThat(produto.getCustoOrigem()).isNull();
        assertThat(produto.getCustoOrigemEm()).isNull();
    }
}
