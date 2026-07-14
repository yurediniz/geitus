package com.geitus.app.iam;

/**
 * Lancada quando o login falha por qualquer motivo relacionado a credencial:
 * usuario inexistente, senha incorreta ou usuario inativo.
 *
 * <p>A mensagem exposta ao cliente e sempre generica ("Credenciais invalidas."),
 * para nao revelar se um determinado e-mail existe no sistema.
 */
public class CredenciaisInvalidasException extends RuntimeException {

    public CredenciaisInvalidasException() {
        super("Credenciais inválidas.");
    }
}
