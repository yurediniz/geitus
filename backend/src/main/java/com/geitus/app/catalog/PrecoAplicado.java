package com.geitus.app.catalog;

import java.math.BigDecimal;

/** Preco unitario escolhido para a venda e a sua origem ({@link PrecoDeVenda#resolver}). */
public record PrecoAplicado(BigDecimal precoUnitario, OrigemPreco origem) {
}
