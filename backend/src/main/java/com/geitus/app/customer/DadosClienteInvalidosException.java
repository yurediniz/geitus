package com.geitus.app.customer;

/**
 * Lancada quando os dados de um cliente violam uma regra de validacao do
 * dominio (nome ausente, CPF/telefone/WhatsApp invalidos). E a defesa do
 * service alem do Bean Validation do request.
 *
 * <p>Deve ser mapeada para HTTP 400 (Bad Request) pelo {@code GlobalExceptionHandler}.
 * A mensagem e fixa e nunca ecoa o valor recebido (CPF e dado pessoal).
 */
public class DadosClienteInvalidosException extends RuntimeException {

    public DadosClienteInvalidosException(String mensagem) {
        super(mensagem);
    }
}
