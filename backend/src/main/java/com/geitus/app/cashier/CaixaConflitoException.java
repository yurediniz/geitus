package com.geitus.app.cashier;

import java.util.Optional;

/**
 * Conflito com o estado do caixa (docs/modules/caixa.md): ponto com nome
 * repetido ou no limite, ponto ocupado ou inativo, caixa ja aberto, em
 * conferencia ou fechado, sangria acima do dinheiro na gaveta, contagem ja
 * registrada e chave de idempotencia com outros dados. Mapeada para 409, com
 * o campo quando o conflito e de um campo.
 */
public class CaixaConflitoException extends RuntimeException {

    private final String campo;

    public CaixaConflitoException(String mensagem) {
        this(mensagem, null);
    }

    public CaixaConflitoException(String mensagem, String campo) {
        super(mensagem);
        this.campo = campo;
    }

    public Optional<String> campo() {
        return Optional.ofNullable(campo);
    }
}
