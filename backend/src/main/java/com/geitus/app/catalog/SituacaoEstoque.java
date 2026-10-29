package com.geitus.app.catalog;

import java.math.BigDecimal;

/**
 * Situacao calculada do estoque do produto, para a listagem e a aba Estoque
 * (docs/modules/estoque.md, regra 16). Nao e coluna: deriva do saldo e dos
 * niveis de referencia. Os filtros da listagem e da posicao repetem a mesma
 * regra em SQL ({@code listagem.SituacaoDaPosicao}).
 */
public enum SituacaoEstoque {
    NEGATIVO,
    ZERADO,
    BAIXO,
    REPOSICAO,
    REGULAR,
    ALTO;

    /**
     * {@code null} sem controle de estoque; senao a primeira que valer, nesta
     * ordem: {@link #NEGATIVO} com saldo &lt; 0; {@link #ZERADO} com saldo 0;
     * {@link #BAIXO} com saldo ate o minimo; {@link #REPOSICAO} com saldo ate o
     * ponto de reposicao; {@link #ALTO} com saldo acima do maximo;
     * {@link #REGULAR} nos demais casos. Nivel nao informado nao vale.
     */
    public static SituacaoEstoque de(boolean controlaEstoque, BigDecimal saldo, BigDecimal pontoReposicao,
            BigDecimal estoqueMinimo, BigDecimal estoqueMaximo) {
        if (!controlaEstoque) {
            return null;
        }
        if (saldo.signum() < 0) {
            return NEGATIVO;
        }
        if (saldo.signum() == 0) {
            return ZERADO;
        }
        if (estoqueMinimo != null && saldo.compareTo(estoqueMinimo) <= 0) {
            return BAIXO;
        }
        if (pontoReposicao != null && saldo.compareTo(pontoReposicao) <= 0) {
            return REPOSICAO;
        }
        if (estoqueMaximo != null && saldo.compareTo(estoqueMaximo) > 0) {
            return ALTO;
        }
        return REGULAR;
    }
}
