package com.geitus.app.sales;

/**
 * Codigo, produto, embalagem, cliente ou venda que nao existe na empresa do
 * usuario, que e de outra empresa (DEC-016) ou, para o OPERADOR, venda de uma
 * sessao de outra pessoa. Mapeada para 404, com o campo quando o recurso veio
 * do carrinho ({@code itens[0]}, {@code clienteId}).
 */
public class VendaNaoEncontradaException extends ErroDaVenda {

    public static final String MENSAGEM_VENDA = "Venda não encontrada.";

    public VendaNaoEncontradaException(String mensagem, String campo) {
        super(mensagem, campo);
    }

    public static VendaNaoEncontradaException venda() {
        return new VendaNaoEncontradaException(MENSAGEM_VENDA, null);
    }
}
