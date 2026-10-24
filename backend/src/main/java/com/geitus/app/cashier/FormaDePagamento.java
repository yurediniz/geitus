package com.geitus.app.cashier;

/**
 * Forma de pagamento (docs/modules/pdv.md, 3.4 e 3.9): a do pagamento da
 * venda e a do movimento de caixa. Os nomes sao gravados como texto e
 * espelham os CHECKs da V17 ({@code ck_movimento_caixa_forma},
 * {@code ck_pagamento_venda_forma}). Abertura, suprimento e sangria sao sempre
 * {@link #DINHEIRO}; a ordem do enum e a das telas e das respostas.
 */
public enum FormaDePagamento {

    DINHEIRO("Dinheiro"),
    DEBITO("Débito"),
    CREDITO("Crédito"),
    PIX("PIX");

    private final String rotulo;

    FormaDePagamento(String rotulo) {
        this.rotulo = rotulo;
    }

    /** Nome da forma nas mensagens ("Informe o valor contado de Débito."). */
    public String rotulo() {
        return rotulo;
    }
}
