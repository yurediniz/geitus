package com.geitus.app.cashier;

import java.util.Optional;

/**
 * Dado invalido verificado no service do caixa (nome do ponto aparado,
 * limite do caixa, justificativa fora de hora). Mapeada para 400, com o campo
 * quando a regra e de um campo. As validacoes de formato ficam no Bean
 * Validation dos DTOs.
 */
public class DadosDoCaixaInvalidosException extends RuntimeException {

    private final String campo;

    public DadosDoCaixaInvalidosException(String mensagem, String campo) {
        super(mensagem);
        this.campo = campo;
    }

    public Optional<String> campo() {
        return Optional.ofNullable(campo);
    }
}
