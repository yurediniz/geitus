package com.geitus.app.catalog.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** Proximo SKU sugerido para a empresa. A sugestao nao reserva o SKU (spec de Produtos). */
@Schema(description = "SKU sugerido no padrao P + 6 digitos")
public record SkuSugestaoResponse(
        @Schema(example = "P000031")
        String sku) {
}
