package com.geitus.app.catalog.imagem;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Grava o {@link TipoDeImagem} como o MIME (coluna {@code tipo}, CHECK da V15). */
@Converter
public class TipoDeImagemNoBanco implements AttributeConverter<TipoDeImagem, String> {

    @Override
    public String convertToDatabaseColumn(TipoDeImagem tipo) {
        return tipo == null ? null : tipo.mime();
    }

    @Override
    public TipoDeImagem convertToEntityAttribute(String mime) {
        return mime == null ? null : TipoDeImagem.doMime(mime);
    }
}
