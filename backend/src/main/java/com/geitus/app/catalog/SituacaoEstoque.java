package com.geitus.app.catalog;

import java.math.BigDecimal;

/**
 * Situacao calculada do estoque do produto, para a listagem e a aba Estoque
 * (docs/modules/produtos-estoque.md, 4.6). Nao e coluna: deriva do saldo e dos
 * niveis de referencia.
 */
public enum SituacaoEstoque {
    NORMAL,
    BAIXO,
    SEM_ESTOQUE;

    /**
     * {@code null} sem controle de estoque; {@link #SEM_ESTOQUE} com saldo
     * menor ou igual a zero; {@link #BAIXO} com saldo ate o ponto de reposicao
     * ou, sem ponto, ate o estoque minimo; {@link #NORMAL} nos demais casos.
     */
    public static SituacaoEstoque de(boolean controlaEstoque, BigDecimal saldo, BigDecimal pontoReposicao,
            BigDecimal estoqueMinimo) {
        if (!controlaEstoque) {
            return null;
        }
        if (saldo.signum() <= 0) {
            return SEM_ESTOQUE;
        }
        BigDecimal limiteDeBaixo = pontoReposicao != null ? pontoReposicao : estoqueMinimo;
        if (limiteDeBaixo != null && saldo.compareTo(limiteDeBaixo) <= 0) {
            return BAIXO;
        }
        return NORMAL;
    }
}
