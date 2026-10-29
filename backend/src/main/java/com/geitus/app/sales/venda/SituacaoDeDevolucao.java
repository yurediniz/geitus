package com.geitus.app.sales.venda;

/**
 * Situacao de devolucao da venda, calculada (nao e coluna; estoque.md, 6.2,
 * regra 7): a venda continua {@code CONCLUIDA}.
 */
public enum SituacaoDeDevolucao {
    /** Nada devolvido. */
    NENHUMA,
    /** Parte dos itens devolvida. */
    PARCIAL,
    /** Todas as linhas devolvidas por inteiro. */
    TOTAL
}
