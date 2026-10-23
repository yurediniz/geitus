package com.geitus.app.catalog.balanca;

/**
 * O que a etiqueta de balanca traz depois do codigo do produto
 * (coluna {@code tipo_informacao}, V11; CHECK {@code ck_etiqueta_tipo_informacao}).
 */
public enum TipoInformacaoEtiqueta {
    /** Valor total em reais. */
    VALOR,
    /** Peso em quilos. */
    PESO
}
