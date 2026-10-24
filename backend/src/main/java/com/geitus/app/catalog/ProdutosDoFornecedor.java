package com.geitus.app.catalog;

import java.util.Collection;
import java.util.Map;

/**
 * Os produtos que um fornecedor vende, vistos pelo fornecedor
 * (docs/modules/fornecedores-e-marcas.md, 4.4): a ligacao
 * {@code produto_fornecedores} pertence ao catalogo, que a expoe ao pacote
 * {@code supplier} por esta interface. Os ids sao os internos, ja resolvidos
 * na empresa do usuario (DEC-016); toda consulta filtra tambem pela empresa.
 */
public interface ProdutosDoFornecedor {

    /** Produtos ligados ao fornecedor. */
    long contar(Long empresaId, Long fornecedorId);

    /** Produtos ligados a cada fornecedor, numa consulta so; fornecedor sem produto fica de fora. */
    Map<Long, Long> contarPorFornecedor(Long empresaId, Collection<Long> fornecedorIds);
}
