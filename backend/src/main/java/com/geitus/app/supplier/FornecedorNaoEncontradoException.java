package com.geitus.app.supplier;

/**
 * Fornecedor (ou item da lista dele) nao encontrado na empresa do usuario,
 * inclusive o de outra empresa: a resposta e a mesma, para nunca vazar dados
 * entre empresas (DEC-016). Mapeada para 404 com a mensagem fixa.
 */
public class FornecedorNaoEncontradoException extends RuntimeException {

    static final String MENSAGEM_FORNECEDOR = "Fornecedor não encontrado.";

    public FornecedorNaoEncontradoException() {
        this(MENSAGEM_FORNECEDOR);
    }

    public FornecedorNaoEncontradoException(String mensagem) {
        super(mensagem);
    }
}
