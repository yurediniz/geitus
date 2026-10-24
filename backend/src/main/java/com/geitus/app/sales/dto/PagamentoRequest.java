package com.geitus.app.sales.dto;

import java.math.BigDecimal;

import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.sales.carrinho.PagamentoInformado;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** Um pagamento: uma linha por forma; no dinheiro, o valor entregue (com o troco). */
@Schema(description = "Pagamento por forma")
public record PagamentoRequest(
        @Schema(description = "DINHEIRO, DEBITO, CREDITO ou PIX")
        @NotNull(message = "Escolha a forma de pagamento.")
        FormaDePagamento forma,

        @Schema(example = "50.00")
        @NotNull(message = "Informe o valor.")
        BigDecimal valor) {

    public PagamentoInformado paraCalculo() {
        return new PagamentoInformado(forma, valor);
    }
}
