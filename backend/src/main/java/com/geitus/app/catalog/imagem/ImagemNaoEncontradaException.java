package com.geitus.app.catalog.imagem;

import com.geitus.app.catalog.CatalogoNaoEncontradoException;

/**
 * Remocao de imagem de um produto que nao tem imagem (docs/modules/produtos.md).
 * Mapeada para 404 pelo tratamento de {@link CatalogoNaoEncontradoException},
 * com mensagem fixa.
 */
public class ImagemNaoEncontradaException extends CatalogoNaoEncontradoException {

    static final String MENSAGEM = "Imagem não encontrada.";

    public ImagemNaoEncontradaException() {
        super(MENSAGEM);
    }
}
