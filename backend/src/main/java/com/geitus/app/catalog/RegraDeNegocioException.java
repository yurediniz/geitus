package com.geitus.app.catalog;

/**
 * Lancada quando uma operacao viola uma regra de negocio do modulo Produtos
 * relativa a dados invalidos (por exemplo: nome vazio, preco/custo/estoque
 * negativo, empresa inexistente).
 *
 * <p>Excecao de validacao simples, generica o suficiente para cobrir as regras
 * de dados invalidos sem criar uma excecao por regra. Mapeada para HTTP 400
 * (Bad Request) pelo {@code GlobalExceptionHandler}. Conflitos de unicidade
 * (SKU/codigo de barras duplicado) usam {@link ProdutoConflitoException} (409).
 */
public class RegraDeNegocioException extends RuntimeException {

    public RegraDeNegocioException(String mensagem) {
        super(mensagem);
    }
}
