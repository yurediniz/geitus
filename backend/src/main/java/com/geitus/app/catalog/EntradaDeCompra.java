package com.geitus.app.catalog;

import java.math.BigDecimal;

/**
 * Uma entrada de estoque por compra com custo (Fase B4,
 * docs/modules/produtos-custo-entrada.md, 3 e 4), como o catalogo a ve: a
 * quantidade em unidades de venda e, se a compra foi em embalagens, o numero
 * de embalagens e o rotulo do retrato ("2" e "CX c/ 18 UN"); os dois nulos na
 * compra em unidades. Vem do estoque pela {@link UsoDoProdutoNoEstoque}.
 */
public record EntradaDeCompra(BigDecimal quantidade, Integer quantidadeDeEmbalagens, String embalagemRotulo) {
}
