package com.geitus.app.company;

/**
 * Lancada quando uma operacao sobre a empresa conflita com o estado atual — no
 * momento, apenas CNPJ ja utilizado por outra empresa (constraint
 * {@code uq_empresa_cnpj}, unico-quando-presente).
 *
 * <p>Mapeada para HTTP 409 (Conflict) pelo {@code GlobalExceptionHandler}. A
 * mensagem e clara e segura para o cliente (nao vaza detalhe interno).
 */
public class ConflitoDeEmpresaException extends RuntimeException {

    public ConflitoDeEmpresaException(String mensagem) {
        super(mensagem);
    }
}
