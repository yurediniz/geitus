package com.geitus.app.catalog;

/**
 * Lancada quando uma operacao em unidade de medida ou categoria conflita com o
 * estado atual da empresa: sigla ou nome entre irmaos repetido, ou exclusao de
 * registro ainda em uso (produtos/subcategorias vinculados).
 *
 * <p>Mapeada para HTTP 409 (Conflict) pelo {@code GlobalExceptionHandler}. A
 * mensagem e fixa e segura para o cliente (docs/modules/produtos.md).
 */
public class CatalogoConflitoException extends RuntimeException {

    public CatalogoConflitoException(String mensagem) {
        super(mensagem);
    }
}
