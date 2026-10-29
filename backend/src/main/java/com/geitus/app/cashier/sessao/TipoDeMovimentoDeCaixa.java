package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;

/**
 * Tipo do movimento de caixa. O valor gravado e sempre positivo; o sinal no
 * esperado sai do tipo (sangria, estorno e devolucao subtraem). Recebimento e
 * estorno sao do PDV (V17; docs/modules/pdv.md): ligados a uma venda, em
 * qualquer forma de pagamento. A devolucao (V19; estoque.md, secao 6.2) e o
 * reembolso de uma devolucao de itens, na sessao de quem devolve.
 */
public enum TipoDeMovimentoDeCaixa {

    /** Fundo de troco; um por sessao, gravado na abertura. */
    ABERTURA,
    /** Dinheiro colocado na gaveta. */
    SUPRIMENTO,
    /** Dinheiro retirado da gaveta. */
    SANGRIA,
    /** O recebido de uma venda, por forma (no dinheiro, sem o troco). */
    RECEBIMENTO,
    /** A devolucao do recebimento de uma venda cancelada, por forma. */
    ESTORNO,
    /** O reembolso de uma devolucao de itens, por forma (na sessao de quem devolve). */
    DEVOLUCAO;

    /** Sangria e suprimento sao lancados na sessao; a abertura so nasce com ela; os da venda vem do PDV. */
    public boolean lancavel() {
        return this == SUPRIMENTO || this == SANGRIA;
    }

    /** Recebimento, estorno e devolucao: ligados a uma venda. */
    public boolean daVenda() {
        return this == RECEBIMENTO || this == ESTORNO || this == DEVOLUCAO;
    }

    /** O efeito do valor no esperado da forma. */
    public BigDecimal comSinal(BigDecimal valor) {
        return this == SANGRIA || this == ESTORNO || this == DEVOLUCAO ? valor.negate() : valor;
    }
}
