package com.geitus.app.catalog;

/**
 * De quem e um codigo de barras na empresa (PDV; docs/modules/pdv.md, 3.1): o
 * produto e, quando o codigo e de uma embalagem, a embalagem (ids internos;
 * {@code embalagemId} nulo para o codigo da unidade de venda).
 */
public record DonoDoCodigoDeBarras(Long produtoId, Long embalagemId) {
}
