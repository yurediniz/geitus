package com.geitus.app.catalog.categoria.dto;

import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Dados de entrada para cadastrar, renomear ou mover uma categoria
 * (docs/modules/categorias-e-unidades.md, 4.3). {@code parentId} nulo coloca a
 * categoria na raiz. Sem {@code empresaId}: a empresa vem do JWT (DEC-016).
 */
@Schema(description = "Dados para cadastro ou edicao (renomear/mover) de uma categoria")
public record CategoriaRequest(

        @Schema(example = "Úmida")
        @NotBlank(message = "Nome da categoria é obrigatório.")
        @Size(max = 100, message = "Nome deve ter no máximo 100 caracteres.")
        String nome,

        @Schema(description = "UUID da categoria pai. Ausente ou nulo = raiz (categoria principal), "
                + "inclusive no PATCH, que substitui nome e pai juntos.")
        UUID parentId) {
}
