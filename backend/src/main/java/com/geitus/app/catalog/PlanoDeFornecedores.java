package com.geitus.app.catalog;

import java.util.List;

/**
 * A lista de fornecedores do produto ja validada (docs/modules/fornecedores-e-marcas.md,
 * 5), pronta para ser aplicada depois de gravar o produto: os ids internos na
 * ordem, sem repeticao, e o da ultima compra (um deles, ou {@code null}).
 * {@link #MANTER} e o PATCH sem a lista: nada muda.
 */
record PlanoDeFornecedores(boolean manter, List<Long> fornecedorIds, Long ultimaCompraId) {

    static final PlanoDeFornecedores MANTER = new PlanoDeFornecedores(true, List.of(), null);
    static final PlanoDeFornecedores NENHUM = new PlanoDeFornecedores(false, List.of(), null);

    PlanoDeFornecedores {
        fornecedorIds = List.copyOf(fornecedorIds);
    }
}
