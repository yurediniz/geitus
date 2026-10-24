package com.geitus.app.sales.dto;

import java.math.BigDecimal;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Codigo lido resolvido ({@code GET /api/pdv/itens?codigo=}; docs/modules/pdv.md,
 * 5.3): o tipo da linha, a quantidade (a lida da etiqueta ou a digitada), o
 * produto, a embalagem (quando o codigo e de uma) e o texto lido.
 */
@Schema(description = "Item resolvido para o carrinho")
public record ItemResolvidoResponse(
        TipoDeLinha tipo,
        BigDecimal quantidade,
        ProdutoDoPdvResponse produto,
        @Schema(nullable = true) UUID embalagemId,
        String codigoLido) {

    /** Unidade do produto, embalagem ou etiqueta de balanca (sempre uma linha nova). */
    public enum TipoDeLinha {
        UNIDADE,
        EMBALAGEM,
        ETIQUETA
    }
}
