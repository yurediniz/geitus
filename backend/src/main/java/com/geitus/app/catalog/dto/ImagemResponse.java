package com.geitus.app.catalog.dto;

import java.time.LocalDateTime;

import com.geitus.app.catalog.imagem.AssinaturaDeImagem;
import com.geitus.app.catalog.imagem.ResumoDaImagem;
import com.geitus.app.catalog.imagem.TamanhoDaImagem;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * A imagem do produto na API (docs/modules/produtos-imagem.md, 4.3): as URLs
 * relativas ja assinadas (validas ate o fim do dia UTC seguinte) e as
 * dimensoes da versao grande. Nunca traz os bytes nem identificadores internos.
 */
@Schema(description = "Imagem do produto, com as URLs assinadas da miniatura e da versao grande")
public record ImagemResponse(
        @Schema(description = "URL relativa e assinada da miniatura (ate 200 px)",
                example = "/api/imagens/produtos/{produto}/{versao}/miniatura?expira=1793059200&assinatura=...")
        String miniaturaUrl,
        @Schema(description = "URL relativa e assinada da versao grande (ate 1200 px)")
        String grandeUrl,
        @Schema(description = "Largura da versao grande, em px", example = "1200")
        int largura,
        @Schema(description = "Altura da versao grande, em px", example = "900")
        int altura,
        @Schema(description = "Quando a imagem foi enviada")
        LocalDateTime atualizadaEm) {

    public static ImagemResponse de(ResumoDaImagem resumo, AssinaturaDeImagem assinatura) {
        return new ImagemResponse(
                assinatura.url(resumo.produtoUuid(), resumo.versao(), TamanhoDaImagem.MINIATURA),
                assinatura.url(resumo.produtoUuid(), resumo.versao(), TamanhoDaImagem.GRANDE),
                resumo.largura(),
                resumo.altura(),
                resumo.atualizadaEm());
    }
}
