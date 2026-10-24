package com.geitus.app.sales.carrinho;

/**
 * Regra violada (ou aviso) no calculo, com o campo do carrinho
 * ({@code itens[0].quantidade}, {@code desconto}, {@code pagamentos}...;
 * docs/modules/pdv.md, 5.4) e a mensagem para o usuario.
 */
public record ErroDoCalculo(String campo, String mensagem) {
}
