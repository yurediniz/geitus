package com.geitus.app.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.listagem.OrdemDaPosicao;
import com.geitus.app.catalog.listagem.StatusFiltro;
import com.geitus.app.inventory.dto.PosicaoDeEstoqueResponse;

/** Padroes e limites dos parametros da posicao e o valor em custo da linha (spec de Estoque, regras 22 e 23). */
class ParametrosDaPosicaoTest {

    @Test
    void ausentesValemOPadrao() {
        ParametrosDaPosicao parametros = ParametrosDaPosicao.daRequisicao(null, null, null, null, null, null, null);

        assertThat(parametros.status()).isEqualTo(StatusFiltro.ATIVOS);
        assertThat(parametros.situacao()).isEmpty();
        assertThat(parametros.ordem()).isEqualTo(OrdemDaPosicao.NOME);
        assertThat(parametros.pagina()).isZero();
        assertThat(parametros.tamanho()).isEqualTo(25);
    }

    @Test
    void buscaLongaDa400NoCampo() {
        assertThatThrownBy(() -> ParametrosDaPosicao.daRequisicao("a".repeat(201), null, null, null, null, 0, 25))
                .isInstanceOf(RegraDeNegocioException.class)
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains("busca"));
    }

    @Test
    void tamanhoAcimaDoLimiteFalha() {
        assertThatThrownBy(() -> ParametrosDaPosicao.daRequisicao(null, null, null, null, null, 0, 101))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void valorEmCustoSoComCustoESaldoPositivoArredondadoMeioParaCima() {
        assertThat(PosicaoDeEstoqueResponse.valorEmCusto(new BigDecimal("1.333"), new BigDecimal("0.10")))
                .isEqualTo(new BigDecimal("0.13"));
        assertThat(PosicaoDeEstoqueResponse.valorEmCusto(new BigDecimal("0.125"), new BigDecimal("1.00")))
                .isEqualTo(new BigDecimal("0.13"));
        assertThat(PosicaoDeEstoqueResponse.valorEmCusto(new BigDecimal("25.000"), new BigDecimal("3.35")))
                .isEqualTo(new BigDecimal("83.75"));
        assertThat(PosicaoDeEstoqueResponse.valorEmCusto(new BigDecimal("0.000"), new BigDecimal("1.00"))).isNull();
        assertThat(PosicaoDeEstoqueResponse.valorEmCusto(new BigDecimal("-2.000"), new BigDecimal("1.00"))).isNull();
        assertThat(PosicaoDeEstoqueResponse.valorEmCusto(BigDecimal.TEN, null)).isNull();
    }
}
