package com.geitus.app.catalog.unidade.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Dados de entrada para cadastro ou edicao de uma unidade de medida
 * (docs/modules/categorias-e-unidades.md, secao 3.4).
 *
 * <p>Nao inclui {@code empresaId} nem {@code ativo}: a empresa vem do usuario
 * autenticado (DEC-016) e o status so muda por inativar/reativar. A sigla e
 * normalizada (aparada, em maiusculas) no {@code UnidadeMedidaService}.
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

        @Schema(description = "Aceita quantidade decimal na venda", example = "true")
        boolean fracionada) {
}
