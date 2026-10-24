package com.geitus.app.catalog.imagem;

/** Os bytes de uma versao da imagem, com o tipo gravado (o {@code Content-Type} da leitura). */
public record BytesDaImagem(byte[] bytes, TipoDeImagem tipo) {
}
