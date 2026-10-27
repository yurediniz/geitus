package com.geitus.app.supplier.dto;

import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** Produto a ligar ao fornecedor pela tela do fornecedor (docs/modules/fornecedores-e-marcas.md). */
@Schema(description = "Produto que o fornecedor vende")
public record ProdutoDoFornecedorRequest(
        @Schema(description = "UUID do produto")
        @NotNull(message = "Informe o produto.")
        UUID produtoId) {
}
