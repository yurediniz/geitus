package com.geitus.app.catalog.dto;

import java.util.UUID;

import com.geitus.app.catalog.FornecedorResumido;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Fornecedor na resposta do produto (docs/modules/fornecedores-e-marcas.md, 5):
 * UUID publico, numero, nome (razao social) e status, para a tela marcar os
 * inativos ligados.
 */
@Schema(description = "Fornecedor do produto")
public record FornecedorResumo(
        @Schema(description = "Identificador publico (UUID)")
        UUID id,
        Long numero,
        @Schema(example = "Distribuidora Central Ltda")
        String nome,
        boolean ativo) {

    public static FornecedorResumo de(FornecedorResumido fornecedor) {
        return new FornecedorResumo(fornecedor.uuid(), fornecedor.numero(), fornecedor.nome(), fornecedor.ativo());
    }
}
