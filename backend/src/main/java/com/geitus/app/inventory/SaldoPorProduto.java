package com.geitus.app.inventory;

import java.math.BigDecimal;

/** Saldo de um produto (projecao de {@link EstoqueSaldoRepository#saldos}); o id e o interno. */
public record SaldoPorProduto(Long produtoId, BigDecimal saldo) {
}
