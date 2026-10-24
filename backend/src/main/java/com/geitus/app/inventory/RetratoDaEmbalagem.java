package com.geitus.app.inventory;

import java.math.BigDecimal;

/**
 * Retrato da embalagem num movimento de estoque informado em embalagens
 * (docs/modules/produtos-embalagens.md, 6; V12): o rotulo, as unidades por
 * embalagem e o numero de embalagens no momento do ajuste. O movimento continua
 * em unidades de venda; o retrato sobrevive a remocao da embalagem (sem FK).
 */
public record RetratoDaEmbalagem(String rotulo, BigDecimal quantidadePorEmbalagem, int quantidadeDeEmbalagens) {
}
