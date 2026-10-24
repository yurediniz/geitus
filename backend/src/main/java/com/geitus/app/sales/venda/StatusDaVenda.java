package com.geitus.app.sales.venda;

/**
 * Situacao da venda (docs/modules/pdv.md, 2 e 4.1): nasce {@code CONCLUIDA} e
 * so pode ir para {@code CANCELADA} (gatilho {@code tg_venda_protegida}, V17).
 */
public enum StatusDaVenda {
    CONCLUIDA,
    CANCELADA
}
