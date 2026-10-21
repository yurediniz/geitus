package com.geitus.app.catalog;

/**
 * Lancada quando um cadastro auxiliar do catalogo (unidade de medida ou
 * categoria) nao e encontrado para a empresa do usuario.
 *
 * <p>Vale tanto para registro inexistente quanto para registro de outra
 * empresa: a resposta e identica, para nunca vazar dados entre empresas
 * (DEC-016). A mensagem e fixa e nao carrega o identificador consultado.
 *
 * <p>Mapeada para HTTP 404 (Not Found) pelo {@code GlobalExceptionHandler}.
 */
public class CatalogoNaoEncontradoException extends RuntimeException {

    public CatalogoNaoEncontradoException(String mensagem) {
        super(mensagem);
    }
}
