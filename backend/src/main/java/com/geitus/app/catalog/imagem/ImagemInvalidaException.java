package com.geitus.app.catalog.imagem;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Imagem do produto recusada pelas conferencias do servidor
 * (docs/modules/produtos.md): partes ausentes, formato, tamanho
 * ou dimensoes. A mensagem e sempre uma das fixas da spec, sem eco do arquivo.
 *
 * <p>E uma {@link RegraDeNegocioException}: o {@code GlobalExceptionHandler}
 * responde 400 com a mensagem, pelo mesmo tratamento das demais regras do
 * catalogo.
 */
public class ImagemInvalidaException extends RegraDeNegocioException {

    public ImagemInvalidaException(String mensagem) {
        super(mensagem);
    }
}
