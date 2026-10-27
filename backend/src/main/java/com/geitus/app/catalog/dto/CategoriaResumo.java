package com.geitus.app.catalog.dto;

import java.util.UUID;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaArvore;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Resumo da categoria embutido na resposta do produto
 * (docs/modules/produtos.md), com o caminho completo na
 * arvore. O {@code id} e o UUID publico.
 */
@Schema(description = "Resumo da categoria do produto")
public record CategoriaResumo(
        @Schema(description = "Identificador publico (UUID)")
        UUID id,
        @Schema(example = "Sachê")
        String nome,
        @Schema(example = "Ração › Úmida › Sachê")
        String caminho) {

    /** Resumo da categoria com o caminho tirado da arvore, ou {@code null} sem categoria. */
    public static CategoriaResumo deOuNulo(Categoria categoria, CategoriaArvore arvore) {
        if (categoria == null) {
            return null;
        }
        return new CategoriaResumo(categoria.getUuid(), categoria.getNome(), arvore.caminho(categoria.getId()));
    }
}
