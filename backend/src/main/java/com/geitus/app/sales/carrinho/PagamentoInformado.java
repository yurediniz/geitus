package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;

import com.geitus.app.cashier.FormaDePagamento;

/** Um pagamento do carrinho: a forma e o valor entregue (no dinheiro, com o troco). */
public record PagamentoInformado(FormaDePagamento forma, BigDecimal valor) {
}
