package com.geitus.app.catalog.listagem;

import java.math.BigDecimal;
import java.util.Objects;

/**
 * Contagens e valor da posicao de estoque para busca, categoria e status, sem o
 * filtro de situacao (spec de Estoque, regra 24).
 *
 * @param produtos          produtos que controlam estoque
 * @param semEstoque        com saldo &lt;= 0
 * @param baixo             com estoque baixo, incluindo os sem estoque
 * @param negativos         com saldo &lt; 0
 * @param valorTotalEmCusto soma de saldo x custo (cada um a centavos) dos que tem saldo &gt; 0 e custo
 * @param semCusto          com saldo &gt; 0 e sem custo, que ficam fora do valor
 */
public record ResumoDaPosicao(long produtos, long semEstoque, long baixo, long negativos,
        BigDecimal valorTotalEmCusto, long semCusto) {

    public static final ResumoDaPosicao VAZIO = new ResumoDaPosicao(0, 0, 0, 0, BigDecimal.ZERO.setScale(2), 0);

    public ResumoDaPosicao {
        Objects.requireNonNull(valorTotalEmCusto, "valorTotalEmCusto");
    }
}
