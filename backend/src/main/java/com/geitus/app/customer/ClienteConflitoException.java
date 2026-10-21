package com.geitus.app.customer;

/**
 * Lancada quando um cadastro/edicao de cliente conflita com o estado atual da
 * empresa — no momento, CPF ja usado por outro cliente da mesma empresa
 * (constraint {@code uq_cliente_empresa_cpf}).
 *
 * <p>Deve ser mapeada para HTTP 409 (Conflict) pelo {@code GlobalExceptionHandler}
 * (padrao DEC-026). A mensagem e segura para o cliente: nunca inclui o CPF.
 */
public class ClienteConflitoException extends RuntimeException {

    public ClienteConflitoException(String mensagem) {
        super(mensagem);
    }
}
