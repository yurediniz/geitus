package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

/** Situacao calculada do estoque (docs/modules/estoque.md). */
class SituacaoEstoqueTest {

    private static BigDecimal q(String valor) {
        return valor == null ? null : new BigDecimal(valor);
    }

    private static SituacaoEstoque situacao(String saldo, String pontoReposicao, String estoqueMinimo) {
        return SituacaoEstoque.de(true, q(saldo), q(pontoReposicao), q(estoqueMinimo));
    }

    @Test
    void semControleNaoTemSituacao() {
        assertThat(SituacaoEstoque.de(false, q("0"), q("5"), q("2"))).isNull();
        assertThat(SituacaoEstoque.de(false, q("12"), null, null)).isNull();
    }

    @Test
    void saldoZeroESemEstoque() {
        assertThat(situacao("0", "5", "2")).isEqualTo(SituacaoEstoque.SEM_ESTOQUE);
        assertThat(situacao("0.000", null, null)).isEqualTo(SituacaoEstoque.SEM_ESTOQUE);
    }

    @Test
    void saldoIgualAoPontoDeReposicaoEBaixo() {
        assertThat(situacao("5", "5", "2")).isEqualTo(SituacaoEstoque.BAIXO);
        assertThat(situacao("5.001", "5", "2")).isEqualTo(SituacaoEstoque.NORMAL);
    }

    @Test
    void semPontoUsaOEstoqueMinimo() {
        assertThat(situacao("2", null, "2")).isEqualTo(SituacaoEstoque.BAIXO);
        assertThat(situacao("3", null, "2")).isEqualTo(SituacaoEstoque.NORMAL);
    }

    @Test
    void comPontoInformadoOMinimoNaoDecide() {
        // Ponto 1 e minimo 2 nao convivem pela validacao, mas a regra da situacao usa o ponto quando existe.
        assertThat(situacao("1.5", "1", "2")).isEqualTo(SituacaoEstoque.NORMAL);
    }

    @Test
    void acimaDosDoisENormal() {
        assertThat(situacao("12", "5", "2")).isEqualTo(SituacaoEstoque.NORMAL);
    }

    @Test
    void semNiveisESaldoPositivoENormal() {
        assertThat(situacao("0.001", null, null)).isEqualTo(SituacaoEstoque.NORMAL);
    }
}
