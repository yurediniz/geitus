package com.geitus.app.catalog;

import java.util.Collection;
import java.util.Set;

/**
 * Consulta do catalogo as vendas (DT-028; docs/modules/pdv.md): produto
 * vendido nao e excluido fisicamente. Declarada aqui e implementada no pacote
 * {@code sales}, para que o catalogo nao dependa do PDV. O {@code empresaId} e
 * sempre o da empresa do usuario autenticado (DEC-016).
 */
public interface UsoDoProdutoEmVendas {

    /** Os produtos destes (ids internos) que ja tem item de venda, numa consulta; nenhum sem ids. */
    Set<Long> produtosComVendas(Long empresaId, Collection<Long> produtoIds);
}
