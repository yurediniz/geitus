package com.geitus.app.catalog.listagem;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.geitus.app.catalog.RegraDeNegocioException;

/** Allow-list da situacao e da ordem da posicao de estoque (spec de Estoque, regra 23). */
class ParametrosDaPosicaoEnumsTest {

    @ParameterizedTest
    @CsvSource({ "repor,REPOR", "negativo,NEGATIVO", "zerado,ZERADO", "baixo,BAIXO", "reposicao,REPOSICAO",
            "regular,REGULAR", "alto,ALTO" })
    void situacaoDaApi(String parametro, SituacaoDaPosicao esperada) {
        assertThat(SituacaoDaPosicao.doParametro(parametro)).isEqualTo(esperada);
    }

    @Test
    void situacaoAusenteEhSemFiltro() {
        assertThat(SituacaoDaPosicao.doParametro(null)).isNull();
        assertThat(SituacaoDaPosicao.doParametro(" ")).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = { "sem", "ZERADO", "1=1", "normal" })
    void situacaoDesconhecida400(String parametro) {
        assertThatThrownBy(() -> SituacaoDaPosicao.doParametro(parametro))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Situação de estoque inválida.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains("situacao"));
    }

    @ParameterizedTest
    @CsvSource({ "nome,NOME", "-nome,NOME_DESC", "saldo,SALDO", "-saldo,SALDO_DESC", "valor,VALOR",
            "-valor,VALOR_DESC" })
    void ordemDaApi(String parametro, OrdemDaPosicao esperada) {
        assertThat(OrdemDaPosicao.doParametro(parametro)).isEqualTo(esperada);
    }

    @Test
    void ordemAusenteEhNome() {
        assertThat(OrdemDaPosicao.doParametro(null)).isEqualTo(OrdemDaPosicao.NOME);
    }

    @ParameterizedTest
    @ValueSource(strings = { "preco", "estoque", "SALDO", "--valor" })
    void ordemDesconhecida400(String parametro) {
        assertThatThrownBy(() -> OrdemDaPosicao.doParametro(parametro))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Ordenação inválida.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains("ordem"));
    }
}
