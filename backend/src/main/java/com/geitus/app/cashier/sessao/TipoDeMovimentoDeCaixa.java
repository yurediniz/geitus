package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;

/**
 * Tipo do movimento de caixa. O valor gravado e sempre positivo; o sinal no
 * esperado sai do tipo (a sangria subtrai). O PDV acrescentara
 * {@code RECEBIMENTO} (docs/modules/caixa.md, 9).
 */
public enum TipoDeMovimentoDeCaixa {

    /** Fundo de troco; um por sessao, gravado na abertura. */
    ABERTURA,
    /** Dinheiro colocado na gaveta. */
    SUPRIMENTO,
    /** Dinheiro retirado da gaveta. */
    SANGRIA;

    /** Sangria e suprimento sao lancados na sessao; a abertura so nasce com ela. */
    public boolean lancavel() {
        return this != ABERTURA;
    }

    /** O efeito do valor no esperado da gaveta. */
    public BigDecimal comSinal(BigDecimal valor) {
        return this == SANGRIA ? valor.negate() : valor;
    }
}
