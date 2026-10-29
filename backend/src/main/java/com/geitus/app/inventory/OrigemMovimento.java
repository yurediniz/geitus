package com.geitus.app.inventory;

/**
 * De onde veio o movimento de estoque ({@code movimentos_estoque.origem}, V9).
 * Espelha o CHECK {@code ck_movimento_estoque_origem}. {@link #VENDA} e a do
 * PDV (V17): a baixa e o estorno da venda, sempre ligados ao item.
 * {@link #DEVOLUCAO} (V19): a entrada da devolucao e a saida do avariado,
 * sempre ligadas ao item da devolucao.
 */
public enum OrigemMovimento {
    AJUSTE_MANUAL,
    CADASTRO,
    VENDA,
    DEVOLUCAO
}
