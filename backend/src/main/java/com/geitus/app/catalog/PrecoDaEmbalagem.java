package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Preco efetivo de uma embalagem e a origem dele
 * (docs/modules/produtos-embalagens.md, 3.1).
 *
 * <p>Com preco proprio, vale o proprio (a promocao da unidade nao o altera).
 * Sem ele, vale a quantidade x o preco vigente da unidade (o promocional,
 * quando a promocao vale hoje), arredondado a centavos meio para cima. O
 * atacado nunca entra: no PDV, quem decide o atacado e a quantidade total.
 */
public record PrecoDaEmbalagem(BigDecimal preco, OrigemPrecoEmbalagem origem) {

    private static final int CASAS_DO_REAL = 2;

    /**
     * @param vigenteDaUnidade o preco da unidade sem o atacado
     *        ({@link PrecoDeVenda#vigenteSemAtacado})
     */
    public static PrecoDaEmbalagem calcular(BigDecimal precoProprio, BigDecimal quantidade,
            PrecoAplicado vigenteDaUnidade) {
        if (precoProprio != null) {
            return new PrecoDaEmbalagem(precoProprio, OrigemPrecoEmbalagem.PROPRIO);
        }
        BigDecimal calculado = quantidade.multiply(vigenteDaUnidade.precoUnitario())
                .setScale(CASAS_DO_REAL, RoundingMode.HALF_UP);
        OrigemPrecoEmbalagem origem = vigenteDaUnidade.origem() == OrigemPreco.PROMOCIONAL
                ? OrigemPrecoEmbalagem.PROMOCAO_DA_UNIDADE
                : OrigemPrecoEmbalagem.UNIDADE;
        return new PrecoDaEmbalagem(calculado, origem);
    }
}
