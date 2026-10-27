package com.geitus.app.catalog.marca.dto;

import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Dados de entrada para cadastrar, renomear ou mover uma marca
 * (docs/modules/fornecedores-e-marcas.md). {@code parentId} nulo coloca a
 * marca na raiz. Sem {@code empresaId}: a empresa vem do JWT (DEC-016).
 */
@Schema(description = "Dados para cadastro ou edicao (renomear/mover) de uma marca")
public record MarcaRequest(

        @Schema(example = "Nexgard")
        @NotBlank(message = "Nome da marca é obrigatório.")
        @Size(max = 100, message = "Nome deve ter no máximo 100 caracteres.")
        String nome,

        @Schema(description = "UUID da marca pai. Ausente ou nulo = raiz (fabricante ou marca principal), "
                + "inclusive no PATCH, que substitui nome e pai juntos.")
        UUID parentId) {
}
