package com.geitus.app.catalog.imagem;

import com.geitus.app.catalog.CatalogoNaoEncontradoException;

/**
 * Remocao de imagem de um produto que nao tem imagem (docs/modules/produtos-imagem.md,
 * 4.1). Mapeada para 404 pelo tratamento de {@link CatalogoNaoEncontradoException},
 * com mensagem fixa.
 */
public class ImagemNaoEncontradaException extends CatalogoNaoEncontradoException {

    static final String MENSAGEM = "Imagem não encontrada.";

    public ImagemNaoEncontradaException() {
        super(MENSAGEM);
    }
}
