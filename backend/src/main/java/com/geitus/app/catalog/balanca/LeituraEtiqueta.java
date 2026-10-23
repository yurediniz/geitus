package com.geitus.app.catalog.balanca;

import java.math.BigDecimal;

/**
 * O que uma etiqueta de balanca traz: o codigo do produto (sem zeros a
 * esquerda) e o valor total em reais ou o peso em quilos, com a escala das
 * casas decimais da configuracao (por exemplo, {@code 10.000}).
 */
public record LeituraEtiqueta(int codigoProduto, TipoInformacaoEtiqueta tipo, BigDecimal valor) {
}
