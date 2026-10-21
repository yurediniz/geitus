package com.geitus.app.customer;

/**
 * Lancada quando um cliente nao e encontrado para a empresa do usuario.
 *
 * <p>Usada tanto para cliente inexistente quanto para cliente de outra empresa:
 * nos dois casos a resposta e identica (o cliente "nao existe" para quem
 * consulta), para nunca vazar dados entre empresas (DEC-016). Nao carrega o
 * identificador consultado.
 *
 * <p>Deve ser mapeada para HTTP 404 (Not Found) pelo {@code GlobalExceptionHandler}.
 */
public class ClienteNaoEncontradoException extends RuntimeException {

    public ClienteNaoEncontradoException() {
        super("Cliente não encontrado.");
    }
}
