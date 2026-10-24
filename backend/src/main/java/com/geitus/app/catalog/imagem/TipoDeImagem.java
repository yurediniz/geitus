package com.geitus.app.catalog.imagem;

import java.util.Arrays;

/**
 * Tipos de imagem aceitos (docs/modules/produtos-imagem.md, 3 e 4.1). O tipo e
 * o mesmo nas duas versoes da imagem e e gravado como o MIME (coluna
 * {@code tipo}, CHECK da V15), que tambem e o {@code Content-Type} da leitura.
 */
public enum TipoDeImagem {

    WEBP("image/webp"),
    JPEG("image/jpeg");

    private final String mime;

    TipoDeImagem(String mime) {
        this.mime = mime;
    }

    public String mime() {
        return mime;
    }

    /** O tipo gravado no banco; um MIME fora da lista e erro de programacao (a V15 nao o aceita). */
    public static TipoDeImagem doMime(String mime) {
        return Arrays.stream(values())
                .filter(tipo -> tipo.mime.equals(mime))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Tipo de imagem desconhecido."));
    }
}
