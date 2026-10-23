package com.geitus.app.catalog.balanca.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Teste de etiqueta: o numero lido e a configuracao da TELA (ainda nao salva),
 * para o usuario conferir o formato antes de salvar.
 */
@Schema(description = "Numero lido de uma etiqueta e a configuracao a usar na leitura")
public record TesteEtiquetaRequest(
        @Schema(description = "Numero lido ou digitado da etiqueta", example = "2000542010000")
        @NotBlank(message = "Informe o número da etiqueta.")
        @Size(max = 50, message = "O número da etiqueta deve ter no máximo 50 caracteres.")
        String codigoLido,

        @Schema(description = "Configuracao da tela, ainda nao salva")
        @NotNull(message = "Informe a configuração da etiqueta.")
        @Valid
        ConfiguracaoEtiquetaRequest configuracao) {
}
