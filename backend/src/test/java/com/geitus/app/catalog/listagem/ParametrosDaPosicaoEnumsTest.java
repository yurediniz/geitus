package com.geitus.app.catalog.listagem;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.geitus.app.catalog.RegraDeNegocioException;

/** Allow-list da situacao (multisselecao) e da ordem da posicao de estoque (spec de Estoque, regra 23). */
class ParametrosDaPosicaoEnumsTest {

    @ParameterizedTest
    @CsvSource({ "negativo,NEGATIVO", "zerado,ZERADO", "baixo,BAIXO", "reposicao,REPOSICAO", "regular,REGULAR",
            "alto,ALTO" })
    void situacaoDaApi(String parametro, SituacaoDaPosicao esperada) {
        assertThat(SituacaoDaPosicao.doParametro(List.of(parametro))).containsExactly(esperada);
    }

    @Test
    void variasSituacoesNaOrdemDoEnumSemRepetidos() {
        assertThat(SituacaoDaPosicao.doParametro(List.of("alto", " zerado ", "alto", "negativo")))
                .containsExactly(SituacaoDaPosicao.NEGATIVO, SituacaoDaPosicao.ZERADO, SituacaoDaPosicao.ALTO);
    }

    @Test
    void situacaoAusenteOuEmBrancoEhSemFiltro() {
        assertThat(SituacaoDaPosicao.doParametro(null)).isEmpty();
        assertThat(SituacaoDaPosicao.doParametro(List.of())).isEmpty();
        assertThat(SituacaoDaPosicao.doParametro(Arrays.asList(" ", "", null))).isEmpty();
        assertThat(SituacaoDaPosicao.doParametro(List.of("", "baixo"))).containsExactly(SituacaoDaPosicao.BAIXO);
    }

    @ParameterizedTest
    @ValueSource(strings = { "repor", "sem", "ZERADO", "1=1", "normal" })
    void situacaoDesconhecida400MesmoEntreValidas(String parametro) {
        assertThatThrownBy(() -> SituacaoDaPosicao.doParametro(List.of("zerado", parametro)))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Situação de estoque inválida.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains("situacao"));
    }

    @Test
    void condicaoComOuNaOrdemDoEnumSoComPredicadosFixos() {
        assertThat(SituacaoDaPosicao.condicao(Set.of())).isEmpty();
        assertThat(SituacaoDaPosicao.condicao(Set.of(SituacaoDaPosicao.ZERADO)))
                .isEqualTo(" AND (" + SituacaoDaPosicao.SALDO_ZERADO + ")");
        assertThat(SituacaoDaPosicao.condicao(Set.of(SituacaoDaPosicao.ZERADO, SituacaoDaPosicao.NEGATIVO)))
                .isEqualTo(" AND (" + SituacaoDaPosicao.SALDO_NEGATIVO + " OR " + SituacaoDaPosicao.SALDO_ZERADO
                        + ")");
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
