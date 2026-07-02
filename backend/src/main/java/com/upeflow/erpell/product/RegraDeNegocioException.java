package com.upeflow.erpell.product;

/**
 * Lancada quando uma operacao viola uma regra de negocio do modulo Produtos
 * (por exemplo: nome vazio, preco negativo, SKU duplicado na mesma empresa).
 *
 * <p>Excecao de validacao simples, generica o suficiente para cobrir as
 * regras desta etapa sem criar uma excecao por regra. Ainda sem mapeamento
 * HTTP (nao ha controller nesta etapa). Quando o controller for criado, deve
 * ser tratada pelo {@code GlobalExceptionHandler} (por exemplo, como 400).
 */
public class RegraDeNegocioException extends RuntimeException {

    public RegraDeNegocioException(String mensagem) {
        super(mensagem);
    }
}
