package com.geitus.app.inventory;

/**
 * De onde veio o movimento de estoque ({@code movimentos_estoque.origem}, V9).
 * Espelha o CHECK {@code ck_movimento_estoque_origem}. {@link #VENDA} fica
 * reservada ao PDV: nada a produz nesta fase.
 */
public enum OrigemMovimento {
    AJUSTE_MANUAL,
    CADASTRO,
    VENDA
}
