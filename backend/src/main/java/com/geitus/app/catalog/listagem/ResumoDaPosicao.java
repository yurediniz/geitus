package com.geitus.app.catalog.listagem;

import java.math.BigDecimal;
import java.util.Objects;

/**
 * Contagens e valor da posicao de estoque para busca, categoria e status, sem o
 * filtro de situacao (spec de Estoque, regra 24). As contagens por situacao
 * sao exclusivas (regra 16); os regulares ficam fora.
 *
 * @param produtos          produtos que controlam estoque
 * @param negativos         com saldo &lt; 0
 * @param zerados           com saldo 0
 * @param baixo             com saldo positivo ate o minimo
 * @param reposicao         acima do minimo (ou sem minimo) e ate o ponto de reposicao
 * @param alto              acima do maximo
 * @param valorTotalEmCusto soma de saldo x custo (cada um a centavos) dos que tem saldo &gt; 0 e custo
 * @param semCusto          com saldo &gt; 0 e sem custo, que ficam fora do valor
 */
public record ResumoDaPosicao(long produtos, long negativos, long zerados, long baixo, long reposicao, long alto,
        BigDecimal valorTotalEmCusto, long semCusto) {

    public static final ResumoDaPosicao VAZIO = new ResumoDaPosicao(0, 0, 0, 0, 0, 0, BigDecimal.ZERO.setScale(2), 0);

    public ResumoDaPosicao {
        Objects.requireNonNull(valorTotalEmCusto, "valorTotalEmCusto");
    }
}
