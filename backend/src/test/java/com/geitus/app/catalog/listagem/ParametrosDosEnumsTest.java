package com.geitus.app.catalog.listagem;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Allow-list dos parametros de texto da listagem (spec de Produtos): cada valor
 * da API vira um enum; ausente vale o padrao; qualquer outro texto e 400 com o
 * campo, sem nunca chegar ao SQL.
 */
class ParametrosDosEnumsTest {

    @ParameterizedTest
    @CsvSource({ "nome,NOME", "-nome,NOME_DESC", "preco,PRECO", "-preco,PRECO_DESC", "margem,MARGEM",
            "-margem,MARGEM_DESC", "estoque,ESTOQUE", "-estoque,ESTOQUE_DESC", "recentes,RECENTES",
            "atualizados,ATUALIZADOS" })
    void ordemDaApi(String parametro, OrdemDeProdutos esperada) {
        assertThat(OrdemDeProdutos.doParametro(parametro)).isEqualTo(esperada);
    }

    @Test
    void ordemAusenteEhNome() {
        assertThat(OrdemDeProdutos.doParametro(null)).isEqualTo(OrdemDeProdutos.NOME);
        assertThat(OrdemDeProdutos.doParametro("  ")).isEqualTo(OrdemDeProdutos.NOME);
    }

    @ParameterizedTest
    @ValueSource(strings = { "NOME", "nome desc", "p.id; DROP TABLE produtos", "xyz", "--nome" })
    void ordemDesconhecida400(String parametro) {
        assertThatThrownBy(() -> OrdemDeProdutos.doParametro(parametro))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Ordenação inválida.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains("ordem"));
    }

    @Test
    void cadaOrdemTerminaNoDesempatePorNomeEId() {
        for (OrdemDeProdutos ordem : OrdemDeProdutos.values()) {
            assertThat(ordem.orderBy()).endsWith(", p.nome_normalizado, p.id");
        }
    }

    @Test
    void statusDaApi() {
        assertThat(StatusFiltro.doParametro(null)).isEqualTo(StatusFiltro.ATIVOS);
        assertThat(StatusFiltro.doParametro("ativos")).isEqualTo(StatusFiltro.ATIVOS);
        assertThat(StatusFiltro.doParametro("inativos")).isEqualTo(StatusFiltro.INATIVOS);
        assertThat(StatusFiltro.doParametro(" todos ")).isEqualTo(StatusFiltro.TODOS);
        assertThatThrownBy(() -> StatusFiltro.doParametro("true"))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Status inválido.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains("status"));
    }

    @Test
    void estoqueDaApi() {
        assertThat(EstoqueFiltro.doParametro(null)).isNull();
        assertThat(EstoqueFiltro.doParametro("")).isNull();
        assertThat(EstoqueFiltro.doParametro("baixo")).isEqualTo(EstoqueFiltro.BAIXO);
        assertThat(EstoqueFiltro.doParametro("sem")).isEqualTo(EstoqueFiltro.SEM);
        assertThatThrownBy(() -> EstoqueFiltro.doParametro("zerado"))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Filtro de estoque inválido.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains("estoque"));
    }
}
