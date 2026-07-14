package com.geitus.app.catalog;

/**
 * Lancada quando um produto nao e encontrado para a empresa informada.
 *
 * <p>Usada tanto para produto inexistente quanto para produto que existe mas
 * pertence a outra empresa: nos dois casos o comportamento e identico (o
 * produto "nao existe" para quem esta consultando), para nunca vazar dados
 * entre empresas (DEC-016).
 *
 * <p>Ainda sem mapeamento HTTP nesta etapa (nao ha controller de Produtos).
 * Quando o controller for criado, deve ser tratada pelo
 * {@code GlobalExceptionHandler} (por exemplo, como 404).
 */
public class ProdutoNaoEncontradoException extends RuntimeException {

    public ProdutoNaoEncontradoException() {
        super("Produto não encontrado.");
    }
}
