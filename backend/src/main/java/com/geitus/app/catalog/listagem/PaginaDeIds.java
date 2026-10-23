package com.geitus.app.catalog.listagem;

import java.util.List;

/**
 * Resultado da etapa 1 da listagem: os ids internos da pagina, na ordem pedida,
 * e o total de produtos que passam nos filtros (mesmo quando a pagina esta alem
 * do fim e {@code ids} vem vazia).
 */
public record PaginaDeIds(List<Long> ids, long total) {

    public static final PaginaDeIds VAZIA = new PaginaDeIds(List.of(), 0);

    public PaginaDeIds {
        ids = List.copyOf(ids);
    }
}
