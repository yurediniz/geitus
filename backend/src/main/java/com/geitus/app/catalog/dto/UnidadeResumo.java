package com.geitus.app.catalog.dto;

import java.util.UUID;

import com.geitus.app.catalog.unidade.UnidadeMedida;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Resumo de uma unidade de medida embutido na resposta do produto
 * (docs/modules/categorias-e-unidades.md, 5.2). O {@code id} e o UUID publico.
 */
@Schema(description = "Resumo de uma unidade de medida")
public record UnidadeResumo(
        @Schema(description = "Identificador publico (UUID)")
        UUID id,
        @Schema(example = "UN")
        String sigla,
        @Schema(example = "Unidade")
        String descricao,
        boolean fracionada) {

    /** Resumo da unidade, ou {@code null} se nao houver unidade. */
    public static UnidadeResumo deOuNulo(UnidadeMedida unidade) {
        if (unidade == null) {
            return null;
        }
        return new UnidadeResumo(unidade.getUuid(), unidade.getSigla(), unidade.getDescricao(),
                unidade.isFracionada());
    }
}
