package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;

import com.geitus.app.shared.formato.FormatoBrasileiro;

/**
 * Valores em reais nas mensagens do caixa, no formato da spec:
 * {@code R$ 1.234,56}, com espaco comum (o {@code NumberFormat} de moeda do
 * JDK usa espaco nao separavel).
 */
final class Reais {

    private Reais() {
        // Apenas metodos estaticos.
    }

    static String formatar(BigDecimal valor) {
        return FormatoBrasileiro.reais(valor);
    }
}
