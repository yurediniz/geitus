package com.geitus.app.catalog.balanca.dto;

import com.geitus.app.catalog.balanca.ConfiguracaoEtiqueta;
import com.geitus.app.catalog.balanca.TipoInformacaoEtiqueta;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Configuracao da etiqueta de balanca da empresa. {@code padrao} indica que a
 * empresa ainda nao salvou a sua e a resposta traz o padrao do Geitus.
 */
@Schema(description = "Configuracao da etiqueta de balanca da empresa")
public record ConfiguracaoEtiquetaResponse(
        String prefixo,
        int digitosCodigo,
        int digitosPreenchimento,
        TipoInformacaoEtiqueta tipoInformacao,
        int digitosInformacao,
        int casasDecimais,
        boolean digitoVerificador,
        @Schema(description = "true quando a empresa ainda nao salvou a configuracao (valores do padrao)")
        boolean padrao) {

    public static ConfiguracaoEtiquetaResponse de(ConfiguracaoEtiqueta configuracao, boolean padrao) {
        return new ConfiguracaoEtiquetaResponse(configuracao.prefixo(), configuracao.digitosCodigo(),
                configuracao.digitosPreenchimento(), configuracao.tipoInformacao(), configuracao.digitosInformacao(),
                configuracao.casasDecimais(), configuracao.digitoVerificador(), padrao);
    }
}
