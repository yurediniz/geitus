package com.geitus.app.sales;

import java.util.List;

import com.geitus.app.sales.carrinho.ErroDoCalculo;

/**
 * Regra do carrinho violada ao resolver um codigo ou ao finalizar (quantidade,
 * desconto, preco minimo, pagamento, motivo do cancelamento). Mapeada para 400
 * com os campos.
 */
public class DadosDaVendaInvalidosException extends ErroDaVenda {

    public DadosDaVendaInvalidosException(String mensagem, String campo) {
        super(mensagem, campo);
    }

    public DadosDaVendaInvalidosException(List<ErroDoCalculo> erros) {
        super(erros);
    }
}
