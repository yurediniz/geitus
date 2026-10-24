package com.geitus.app.sales;

import java.util.List;

import com.geitus.app.sales.carrinho.ErroDoCalculo;

/**
 * Base das excecoes do PDV: a mensagem principal e os erros por campo do
 * carrinho (docs/modules/pdv.md, 5.4). A resposta traz a primeira mensagem e,
 * quando ha campo, {@code campos: [{campo, mensagem}]} com todos.
 */
public abstract class ErroDaVenda extends RuntimeException {

    private final transient List<ErroDoCalculo> erros;

    protected ErroDaVenda(String mensagem, String campo) {
        this(List.of(new ErroDoCalculo(campo, mensagem)));
    }

    protected ErroDaVenda(List<ErroDoCalculo> erros) {
        super(erros.get(0).mensagem());
        this.erros = List.copyOf(erros);
    }

    /** Os erros, com o campo ({@code null} quando o erro nao e de um campo). */
    public List<ErroDoCalculo> erros() {
        return erros;
    }
}
