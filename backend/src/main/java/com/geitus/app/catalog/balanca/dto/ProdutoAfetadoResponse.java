package com.geitus.app.catalog.balanca.dto;

import java.util.UUID;

import com.geitus.app.catalog.Produto;

import io.swagger.v3.oas.annotations.media.Schema;

/** Produto "Vendido na balanca" cujo codigo tem mais digitos do que a etiqueta salva comporta. */
@Schema(description = "Produto vendido na balanca com codigo grande demais para a etiqueta")
public record ProdutoAfetadoResponse(
        @Schema(description = "Identificador publico (UUID)")
        UUID id,
        Long numero,
        String nome,
        Integer codigo) {

    public static ProdutoAfetadoResponse de(Produto produto) {
        return new ProdutoAfetadoResponse(produto.getUuid(), produto.getNumero(), produto.getNome(),
                produto.getCodigo());
    }
}
