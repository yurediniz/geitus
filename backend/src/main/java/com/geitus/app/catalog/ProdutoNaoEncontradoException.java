package com.geitus.app.catalog;

/**
 * Lancada quando um produto nao e encontrado para a empresa informada.
 *
 * <p>Usada tanto para produto inexistente quanto para produto que existe mas
 * pertence a outra empresa: nos dois casos o comportamento e identico (o
 * produto "nao existe" para quem esta consultando), para nunca vazar dados
 * entre empresas (DEC-016).
 *
 * <p>Mapeada para HTTP 404 (Not Found) pelo {@code GlobalExceptionHandler}.
 */
public class ProdutoNaoEncontradoException extends RuntimeException {

    public ProdutoNaoEncontradoException() {
        super("Produto não encontrado.");
    }
}
