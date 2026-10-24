package com.geitus.app.inventory;

import java.math.BigDecimal;

/** A quantidade (com sinal) do movimento de um item de venda, lida em lote no estorno. */
public record QuantidadeDoItem(Long itemVendaId, BigDecimal quantidade) {
}
