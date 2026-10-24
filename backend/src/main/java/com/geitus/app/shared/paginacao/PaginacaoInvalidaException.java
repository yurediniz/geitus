package com.geitus.app.shared.paginacao;

/**
 * Pagina ou tamanho fora dos limites de {@link Paginacao}. Mapeada para 400
 * pelo {@code GlobalExceptionHandler}, com a mensagem fixa e sem
 * {@code campos} (o mesmo corpo de antes, quando a regra lancava a excecao do
 * catalogo). Fica em {@code shared} para que a paginacao nao dependa de
 * nenhum modulo de negocio.
 */
public class PaginacaoInvalidaException extends RuntimeException {

    public PaginacaoInvalidaException(String mensagem) {
        super(mensagem);
    }
}
