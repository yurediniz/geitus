package com.geitus.app.catalog.balanca.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.geitus.app.catalog.balanca.ConfiguracaoEtiqueta;
import com.geitus.app.catalog.balanca.TipoInformacaoEtiqueta;
import com.geitus.app.shared.json.InteiroSemCasasDecimais;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/**
 * Formato da etiqueta de balanca enviado pela tela (salvar ou testar). Aqui so
 * se exige que cada campo venha; os intervalos e a soma de 13 digitos ficam em
 * {@link ConfiguracaoEtiqueta#validada} (400 com o campo ou com a mensagem da
 * soma). Nao tem empresa: ela vem sempre do usuario autenticado (DEC-016).
 */
@Schema(description = "Formato da etiqueta de balanca (a soma dos digitos precisa dar 13)")
public record ConfiguracaoEtiquetaRequest(
        @Schema(description = "1 ou 2 digitos no inicio da etiqueta", example = "2")
        @NotNull(message = "Informe o prefixo.")
        String prefixo,

        @Schema(description = "Digitos do codigo do produto, de 4 a 6", example = "6")
        @NotNull(message = "Informe os dígitos do código.")
        @JsonDeserialize(using = InteiroSemCasasDecimais.class)
        Integer digitosCodigo,

        @Schema(description = "Zeros entre o codigo e a informacao, de 0 a 2", example = "0")
        @NotNull(message = "Informe os dígitos de preenchimento.")
        @JsonDeserialize(using = InteiroSemCasasDecimais.class)
        Integer digitosPreenchimento,

        @Schema(description = "VALOR (R$ total) ou PESO (kg)", example = "VALOR")
        @NotNull(message = "Informe se a etiqueta traz o valor ou o peso.")
        TipoInformacaoEtiqueta tipoInformacao,

        @Schema(description = "Digitos do valor ou do peso, de 4 a 7", example = "6")
        @NotNull(message = "Informe os dígitos da informação.")
        @JsonDeserialize(using = InteiroSemCasasDecimais.class)
        Integer digitosInformacao,

        @Schema(description = "Casas decimais do valor ou do peso, 2 ou 3", example = "3")
        @NotNull(message = "Informe as casas decimais.")
        @JsonDeserialize(using = InteiroSemCasasDecimais.class)
        Integer casasDecimais,

        @Schema(description = "Se a etiqueta termina com o digito verificador EAN-13", example = "false")
        @NotNull(message = "Informe se a etiqueta tem dígito verificador.")
        Boolean digitoVerificador) {

    /**
     * A configuracao como valor de dominio, ja validada: campo ausente ou fora
     * do intervalo e soma diferente de 13 viram 400 ({@link ConfiguracaoEtiqueta#validada}),
     * inclusive em chamadas sem {@code @Valid} (nenhum {@code Integer} nulo e
     * desembrulhado sem checar).
     */
    public ConfiguracaoEtiqueta paraConfiguracao() {
        return ConfiguracaoEtiqueta.validada(prefixo, digitosCodigo, digitosPreenchimento, tipoInformacao,
                digitosInformacao, casasDecimais, digitoVerificador);
    }
}
