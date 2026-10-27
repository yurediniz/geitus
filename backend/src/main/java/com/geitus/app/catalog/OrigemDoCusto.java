package com.geitus.app.catalog;

/**
 * De onde veio o custo atual do produto ({@code produtos.custo_origem}) e o de
 * cada linha de custo do historico ({@code produto_historico_precos.origem}),
 * V13 (Fase B4, docs/modules/estoque.md; DEC-038). Os
 * nomes sao gravados como texto e espelham as CHECKs da V13.
 */
public enum OrigemDoCusto {
    /** O custo veio de uma entrada de estoque por compra. */
    ENTRADA_COMPRA,
    /** O custo foi digitado no cadastro ou na edicao do produto. */
    EDICAO
}
