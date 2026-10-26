package com.geitus.app.sales.dto;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Uma pagina do catalogo do PDV (docs/modules/pdv.md, 3.1 e 5.3): os produtos
 * ativos, os mais vendidos primeiro, e se ha mais paginas.
 */
@Schema(description = "Pagina do catalogo do PDV")
public record CatalogoDoPdvResponse(List<ProdutoDoPdvResponse> produtos, boolean temMais) {
}
