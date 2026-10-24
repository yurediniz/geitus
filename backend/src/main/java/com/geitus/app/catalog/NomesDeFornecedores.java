package com.geitus.app.catalog;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * O que o catalogo (e o estoque) precisa saber dos fornecedores: numero, nome
 * e status, por id interno ou pelo UUID publico, sempre em lote e dentro da
 * empresa (DEC-016). Declarada aqui e implementada no pacote {@code supplier}:
 * o catalogo nao depende dele.
 */
public interface NomesDeFornecedores {

    /** Os fornecedores da empresa com estes ids internos; os de outra empresa ficam de fora. */
    Map<Long, FornecedorResumido> porIds(Long empresaId, Collection<Long> ids);

    /** Os fornecedores da empresa com estes UUIDs; os de outra empresa ou inexistentes ficam de fora. */
    Map<UUID, FornecedorResumido> porUuids(Long empresaId, Collection<UUID> uuids);
}
