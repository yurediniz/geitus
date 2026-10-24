package com.geitus.app.catalog.dto;

import java.util.UUID;

import com.geitus.app.catalog.arvore.Arvore;
import com.geitus.app.catalog.marca.Marca;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Resumo da marca embutido na resposta do produto
 * (docs/modules/fornecedores-e-marcas.md, 3.3), com o caminho completo na
 * arvore de marcas. O {@code id} e o UUID publico.
 */
@Schema(description = "Resumo da marca do produto")
public record MarcaResumo(
        @Schema(description = "Identificador publico (UUID)")
        UUID id,
        @Schema(example = "Nexgard")
        String nome,
        @Schema(example = "Boehringer › Nexgard")
        String caminho) {

    /** Resumo da marca com o caminho tirado da arvore, ou {@code null} sem marca. */
    public static MarcaResumo deOuNulo(Marca marca, Arvore<Marca> arvore) {
        if (marca == null) {
            return null;
        }
        return new MarcaResumo(marca.getUuid(), marca.getNome(), arvore.caminho(marca.getId()));
    }
}
