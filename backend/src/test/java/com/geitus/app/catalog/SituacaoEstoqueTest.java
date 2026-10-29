package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Situacao calculada do estoque em seis niveis (docs/modules/estoque.md, regra 16). */
class SituacaoEstoqueTest {

    private static BigDecimal q(String valor) {
        return valor == null ? null : new BigDecimal(valor);
    }

    private static SituacaoEstoque situacao(String saldo, String minimo, String ponto, String maximo) {
        return SituacaoEstoque.de(true, q(saldo), q(ponto), q(minimo), q(maximo));
    }

    @Test
    void semControleNaoTemSituacao() {
        assertThat(SituacaoEstoque.de(false, q("0"), q("5"), q("2"), q("10"))).isNull();
        assertThat(SituacaoEstoque.de(false, q("-3"), null, null, null)).isNull();
    }

    /** Minimo 2, ponto 5 e maximo 10: cada faixa e os limites iguais. */
    @ParameterizedTest(name = "saldo {0} -> {1}")
    @CsvSource({
            "-0.001, NEGATIVO",
            "-3, NEGATIVO",
            "0, ZERADO",
            "0.000, ZERADO",
            "0.001, BAIXO",
            "2, BAIXO",
            "2.001, REPOSICAO",
            "5, REPOSICAO",
            "5.001, REGULAR",
            "10, REGULAR",
            "10.001, ALTO",
    })
    void comOsTresNiveis(String saldo, SituacaoEstoque esperada) {
        assertThat(situacao(saldo, "2", "5", "10")).isEqualTo(esperada);
    }

    @Test
    void soComMinimoNaoHaReposicaoNemAlto() {
        assertThat(situacao("2", "2", null, null)).isEqualTo(SituacaoEstoque.BAIXO);
        assertThat(situacao("3", "2", null, null)).isEqualTo(SituacaoEstoque.REGULAR);
        assertThat(situacao("1000", "2", null, null)).isEqualTo(SituacaoEstoque.REGULAR);
    }

    @Test
    void soComPontoAReposicaoVemNoLugarDoBaixo() {
        assertThat(situacao("0.5", null, "5", null)).isEqualTo(SituacaoEstoque.REPOSICAO);
        assertThat(situacao("5", null, "5", null)).isEqualTo(SituacaoEstoque.REPOSICAO);
        assertThat(situacao("6", null, "5", null)).isEqualTo(SituacaoEstoque.REGULAR);
    }

    @Test
    void soComMaximoAcimaEAlto() {
        assertThat(situacao("1", null, null, "10")).isEqualTo(SituacaoEstoque.REGULAR);
        assertThat(situacao("10", null, null, "10")).isEqualTo(SituacaoEstoque.REGULAR);
        assertThat(situacao("11", null, null, "10")).isEqualTo(SituacaoEstoque.ALTO);
    }

    @Test
    void semNiveisSoNegativoZeradoOuRegular() {
        assertThat(situacao("-1", null, null, null)).isEqualTo(SituacaoEstoque.NEGATIVO);
        assertThat(situacao("0", null, null, null)).isEqualTo(SituacaoEstoque.ZERADO);
        assertThat(situacao("0.001", null, null, null)).isEqualTo(SituacaoEstoque.REGULAR);
        assertThat(situacao("99999", null, null, null)).isEqualTo(SituacaoEstoque.REGULAR);
    }

    @Test
    void minimoEMaximoSemPonto() {
        assertThat(situacao("2", "2", null, "10")).isEqualTo(SituacaoEstoque.BAIXO);
        assertThat(situacao("3", "2", null, "10")).isEqualTo(SituacaoEstoque.REGULAR);
        assertThat(situacao("12", "2", null, "10")).isEqualTo(SituacaoEstoque.ALTO);
    }

    @Test
    void minimoIgualAoPonto() {
        assertThat(situacao("5", "5", "5", "10")).isEqualTo(SituacaoEstoque.BAIXO);
        assertThat(situacao("5.001", "5", "5", "10")).isEqualTo(SituacaoEstoque.REGULAR);
    }
}
