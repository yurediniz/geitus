package com.geitus.app.supplier;

/**
 * O que o fornecedor precisa saber do estoque: quantas entradas por compra
 * foram registradas com ele (exclusao barrada, docs/modules/fornecedores-e-marcas.md,
 * 4.5). Implementada no pacote {@code inventory}, que depende deste; este
 * pacote nao depende do estoque.
 */
public interface EntradasDoFornecedor {

    /** Movimentos de estoque da empresa com o fornecedor (id interno). */
    long contar(Long empresaId, Long fornecedorId);
}
