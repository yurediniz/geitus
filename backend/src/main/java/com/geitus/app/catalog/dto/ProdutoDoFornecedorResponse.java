package com.geitus.app.catalog.dto;

import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Um produto que o fornecedor vende, na lista da tela do fornecedor
 * (docs/modules/fornecedores-e-marcas.md): Nº, nome e codigos, e se
 * este fornecedor e o da ultima compra do produto (a tela avisa antes de
 * remover).
 */
@Schema(description = "Produto ligado ao fornecedor")
public record ProdutoDoFornecedorResponse(
        @Schema(description = "Identificador publico do produto (UUID)")
        UUID id,
        Long numero,
        String nome,
        @Schema(description = "Codigo do produto (1 a 999999); null se nao houver")
        Integer codigo,
        String sku,
        boolean ativo,
        @Schema(description = "Se este fornecedor e o da ultima compra do produto")
        boolean fornecedorDaUltimaCompra) {
}
