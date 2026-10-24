package com.geitus.app.sales.carrinho;

import com.geitus.app.catalog.OrigemPreco;

/**
 * De onde veio o preco unitario da linha (coluna {@code itens_venda.origem_preco},
 * V17): o preco da unidade ({@code NORMAL}, {@code PROMOCIONAL} ou
 * {@code ATACADO}), o da embalagem ou o da etiqueta de balanca.
 */
public enum OrigemPrecoDaVenda {
    NORMAL,
    PROMOCIONAL,
    ATACADO,
    EMBALAGEM,
    ETIQUETA;

    static OrigemPrecoDaVenda da(OrigemPreco origem) {
        return switch (origem) {
            case NORMAL -> NORMAL;
            case PROMOCIONAL -> PROMOCIONAL;
            case ATACADO -> ATACADO;
        };
    }
}
