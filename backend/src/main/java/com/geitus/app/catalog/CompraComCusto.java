package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Entrada por compra ja gravada pelo estoque, com o que o catalogo precisa
 * para aplicar o custo no produto (Fase B4, docs/modules/estoque.md):
 * o id interno do movimento (ligado a linha do historico), o custo
 * por unidade de venda com 4 casas e a data do movimento (a da origem do
 * custo).
 */
public record CompraComCusto(Long movimentoId, BigDecimal custoUnitario, LocalDateTime em) {
}
