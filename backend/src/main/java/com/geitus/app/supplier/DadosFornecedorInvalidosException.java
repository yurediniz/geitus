package com.geitus.app.supplier;

import java.util.Optional;

/**
 * Dado invalido no cadastro do fornecedor (docs/modules/fornecedores-e-marcas.md,
 * 4.6), com o campo do request quando a regra e de um campo. Mapeada para 400;
 * as mensagens sao fixas e nunca ecoam o valor recebido.
 */
public class DadosFornecedorInvalidosException extends RuntimeException {

    private final String campo;

    public DadosFornecedorInvalidosException(String mensagem, String campo) {
        super(mensagem);
        this.campo = campo;
    }

    public Optional<String> campo() {
        return Optional.ofNullable(campo);
    }
}
