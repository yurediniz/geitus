package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Margem e markup de um preco sobre um custo, em % com 2 casas e
 * arredondamento {@code HALF_UP} (docs/modules/produtos.md).
 * Valem para o produto e para as embalagens (Fase B3). Sao derivados:
 * nunca tem coluna.
 */
public final class MargemEMarkup {

    private static final BigDecimal CEM = new BigDecimal("100");
    private static final int CASAS_PERCENTUAL = 2;

    private MargemEMarkup() {
        // Apenas metodos estaticos.
    }

    /**
     * Margem sobre a venda: (preco - custo) / preco * 100. Exige custo
     * informado e preco &gt; 0 (evita divisao por zero); senao {@code null}.
     */
    public static BigDecimal margem(BigDecimal preco, BigDecimal custo) {
        if (custo == null || preco == null || preco.signum() <= 0) {
            return null;
        }
        return preco.subtract(custo)
                .multiply(CEM)
                .divide(preco, CASAS_PERCENTUAL, RoundingMode.HALF_UP);
    }

    /**
     * Marcacao sobre o custo: (preco - custo) / custo * 100. Exige custo &gt; 0
     * (evita divisao por zero); senao {@code null}.
     */
    public static BigDecimal markup(BigDecimal preco, BigDecimal custo) {
        if (preco == null || custo == null || custo.signum() <= 0) {
            return null;
        }
        return preco.subtract(custo)
                .multiply(CEM)
                .divide(custo, CASAS_PERCENTUAL, RoundingMode.HALF_UP);
    }
}
