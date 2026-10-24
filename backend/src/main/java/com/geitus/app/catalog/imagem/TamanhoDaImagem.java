package com.geitus.app.catalog.imagem;

import java.util.Arrays;
import java.util.Optional;

/** As duas versoes da imagem, com o nome que aparece no caminho da URL assinada. */
public enum TamanhoDaImagem {

    GRANDE("grande"),
    MINIATURA("miniatura");

    private final String noCaminho;

    TamanhoDaImagem(String noCaminho) {
        this.noCaminho = noCaminho;
    }

    public String noCaminho() {
        return noCaminho;
    }

    /** O tamanho pelo nome exato do caminho; qualquer outro valor fica vazio. */
    public static Optional<TamanhoDaImagem> doCaminho(String valor) {
        return Arrays.stream(values()).filter(tamanho -> tamanho.noCaminho.equals(valor)).findFirst();
    }
}
