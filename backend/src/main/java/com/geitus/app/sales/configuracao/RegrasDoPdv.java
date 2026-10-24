package com.geitus.app.sales.configuracao;

import java.math.BigDecimal;

/**
 * O que a configuracao do PDV decide na venda (docs/modules/pdv.md, 3.10):
 * vender sem estoque (padrao ligado) e o desconto maximo do OPERADOR em
 * percentual (padrao 10,00).
 */
public record RegrasDoPdv(boolean venderSemEstoque, BigDecimal descontoMaximoOperador) {

    public static final RegrasDoPdv PADRAO = new RegrasDoPdv(true, new BigDecimal("10.00"));
}
