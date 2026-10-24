package com.geitus.app.catalog;

/** De onde vem o preco efetivo de uma embalagem ({@link PrecoDaEmbalagem}). */
public enum OrigemPrecoEmbalagem {
    /** O preco proprio da embalagem. */
    PROPRIO,
    /** Quantidade x preco de venda da unidade. */
    UNIDADE,
    /** Quantidade x preco promocional da unidade, com a promocao vigente hoje. */
    PROMOCAO_DA_UNIDADE
}
