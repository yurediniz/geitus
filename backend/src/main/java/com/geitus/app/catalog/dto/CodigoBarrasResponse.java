package com.geitus.app.catalog.dto;

import com.geitus.app.catalog.FormatoCodigoBarras;
import com.geitus.app.catalog.ProdutoCodigoBarras;

import io.swagger.v3.oas.annotations.media.Schema;

/** Codigo de barras de um produto com o formato gravado (sem ids internos). */
@Schema(description = "Codigo de barras do produto e o formato reconhecido")
public record CodigoBarrasResponse(
        @Schema(example = "7891000315507")
        String codigo,
        @Schema(description = "EAN8, UPCA, EAN13 ou OUTRO (formato nao reconhecido)", example = "EAN13")
        FormatoCodigoBarras formato) {

    public static CodigoBarrasResponse de(ProdutoCodigoBarras codigoBarras) {
        return new CodigoBarrasResponse(codigoBarras.getCodigo(), codigoBarras.getFormato());
    }
}
