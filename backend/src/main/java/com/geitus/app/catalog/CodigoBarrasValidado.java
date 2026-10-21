package com.geitus.app.catalog;

/**
 * Codigo de barras ja normalizado e validado pelo {@code ProdutoService}, com o
 * formato que deve ser gravado: o detectado para um codigo novo, ou o ja
 * gravado para um codigo que o produto mantem (Review Focus 1 da Fase B).
 */
public record CodigoBarrasValidado(String codigo, FormatoCodigoBarras formato) {
}
