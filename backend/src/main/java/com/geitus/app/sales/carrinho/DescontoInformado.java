package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;

/**
 * Desconto do item ou do total como veio do carrinho: em percentual (0 a 100)
 * ou em reais, com ate 2 casas. A {@link CalculadoraDaVenda} confere os limites
 * e devolve o erro no campo.
 */
public record DescontoInformado(TipoDesconto tipo, BigDecimal valor) {
}
