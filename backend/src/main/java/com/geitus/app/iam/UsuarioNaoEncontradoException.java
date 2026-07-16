package com.geitus.app.iam;

/**
 * Lancada quando um usuario nao e encontrado para a empresa do usuario
 * autenticado.
 *
 * <p>Usada tanto para usuario inexistente quanto para usuario que existe mas
 * pertence a outra empresa: nos dois casos o comportamento e identico (o
 * usuario "nao existe" para quem consulta), para nunca vazar dados entre
 * empresas (DEC-016). Mapeada para HTTP 404 pelo {@code GlobalExceptionHandler}.
 */
public class UsuarioNaoEncontradoException extends RuntimeException {

    public UsuarioNaoEncontradoException() {
        super("Usuário não encontrado.");
    }
}
