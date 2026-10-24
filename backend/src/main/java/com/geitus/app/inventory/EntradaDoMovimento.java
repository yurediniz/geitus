package com.geitus.app.inventory;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.geitus.app.catalog.EntradaDeCompra;

/**
 * Linha da consulta em lote das entradas por compra ligadas ao historico de
 * precos (Fase B4): o id interno do movimento, para montar o mapa, e os dados
 * da {@link EntradaDeCompra}.
 */
public record EntradaDoMovimento(Long movimentoId, BigDecimal quantidade, Integer quantidadeDeEmbalagens,
        String embalagemRotulo, LocalDateTime em) {

    EntradaDeCompra entrada() {
        return new EntradaDeCompra(quantidade, quantidadeDeEmbalagens, embalagemRotulo, em);
    }
}
