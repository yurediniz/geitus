package com.geitus.app.catalog;

import java.math.BigDecimal;

/**
 * Rotulo de uma embalagem (docs/modules/produtos.md):
 * {@code {sigla} c/ {quantidade} {sigla de venda}}, com a quantidade sem zeros
 * a direita e virgula decimal ("CX c/ 3 UN", "SC c/ 25,5 KG"). Derivado: nao
 * tem coluna; o historico e o movimento guardam o rotulo do momento. O
 * frontend aplica a mesma regra.
 */
public final class RotuloDaEmbalagem {

    private RotuloDaEmbalagem() {
        // Apenas metodos estaticos.
    }

    public static String de(String sigla, BigDecimal quantidade, String siglaDeVenda) {
        return sigla + " c/ " + quantidade.stripTrailingZeros().toPlainString().replace('.', ',') + " "
                + siglaDeVenda;
    }
}
