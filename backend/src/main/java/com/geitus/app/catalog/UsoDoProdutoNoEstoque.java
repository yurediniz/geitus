package com.geitus.app.catalog;

import java.util.Collection;
import java.util.Map;

/**
 * Consultas do catalogo ao estoque (docs/modules/produtos-estoque.md, 4.7 e
 * 4.8). Declarada aqui e implementada no pacote {@code inventory}, para que o
 * catalogo nao dependa do estoque. O {@code empresaId} e sempre o da empresa do
 * usuario autenticado (DEC-016).
 */
public interface UsoDoProdutoNoEstoque {

    /**
     * Resumo de estoque de cada produto, em lote (no maximo duas consultas,
     * qualquer que seja o numero de produtos). Produto sem movimentos pode
     * ficar fora do mapa: vale {@link ResumoDeEstoque#VAZIO}.
     */
    Map<Long, ResumoDeEstoque> resumos(Long empresaId, Collection<Long> produtoIds);

    /** Se algum produto da empresa com esta unidade de venda ja teve movimento de estoque. */
    boolean algumProdutoDaUnidadeTemMovimentos(Long empresaId, Long unidadeId);
}
