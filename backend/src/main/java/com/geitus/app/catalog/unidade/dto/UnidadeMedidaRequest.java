package com.geitus.app.catalog.unidade.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Dados de entrada para cadastro ou edicao de uma unidade de medida
 * (docs/modules/produtos.md).
 *
 * <p>Nao inclui {@code empresaId} nem {@code ativo}: a empresa vem do usuario
 * autenticado (DEC-016) e o status so muda por inativar/reativar. A sigla e
 * normalizada (aparada, em maiusculas) no {@code UnidadeMedidaService}.
 * {@code fracionada} e {@link Boolean} com {@code @NotNull} para que a
 * ausencia do campo vire 400, em vez de cair silenciosamente em {@code false}.
 */
@Schema(description = "Dados para cadastro ou edicao de uma unidade de medida")
public record UnidadeMedidaRequest(

        @Schema(example = "KG")
        @NotBlank(message = "Sigla é obrigatória.")
        @Size(max = 20, message = "Sigla deve ter no máximo 20 caracteres.")
        String sigla,

        @Schema(example = "Quilograma")
        @NotBlank(message = "Descrição é obrigatória.")
        @Size(max = 60, message = "Descrição deve ter no máximo 60 caracteres.")
        String descricao,

        @Schema(description = "Aceita quantidade decimal na venda (obrigatorio)", example = "true")
        @NotNull(message = "Informe se a unidade aceita quantidade fracionada.")
        Boolean fracionada) {
}
