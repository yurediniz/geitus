package com.geitus.app.sales;

import java.util.List;

import com.geitus.app.sales.carrinho.ErroDoCalculo;

/**
 * Conflito com o estado atual (409): produto inativo, estoque insuficiente com
 * "Vender sem estoque" desligada, total que mudou, chave usada com outros
 * dados, venda ja cancelada ou de um caixa que nao esta mais aberto.
 */
public class VendaConflitoException extends ErroDaVenda {

    public VendaConflitoException(String mensagem, String campo) {
        super(mensagem, campo);
    }

    public VendaConflitoException(List<ErroDoCalculo> erros) {
        super(erros);
    }
}
