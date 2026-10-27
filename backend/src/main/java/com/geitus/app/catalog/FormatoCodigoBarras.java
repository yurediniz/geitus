package com.geitus.app.catalog;

/**
 * Formato de um codigo de barras, deduzido pelo conteudo (spec de Produtos):
 * {@code EAN8}, {@code UPCA} e {@code EAN13} so com digito verificador GS1
 * valido; qualquer outro conteudo e {@code OUTRO}. Gravado como texto em
 * {@code produto_codigos_barras.formato} (V7, {@code ck_codigo_barras_formato}).
 */
public enum FormatoCodigoBarras {
    EAN8,
    UPCA,
    EAN13,
    OUTRO
}
