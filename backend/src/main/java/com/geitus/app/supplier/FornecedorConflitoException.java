package com.geitus.app.supplier;

import java.util.Optional;

/**
 * Conflito no cadastro do fornecedor: documento ja usado por outro fornecedor
 * da empresa ou exclusao de fornecedor com produtos ou entradas
 * (docs/modules/fornecedores-e-marcas.md). Mapeada para 409, com o
 * campo quando o conflito e de um campo.
 */
public class FornecedorConflitoException extends RuntimeException {

    private final String campo;

    public FornecedorConflitoException(String mensagem) {
        this(mensagem, null);
    }

    public FornecedorConflitoException(String mensagem, String campo) {
        super(mensagem);
        this.campo = campo;
    }

    public Optional<String> campo() {
        return Optional.ofNullable(campo);
    }
}
