package com.upeflow.erpell.product.dto;

import java.math.BigDecimal;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Dados de entrada para cadastro ou atualizacao de um produto.
 *
 * <p>Nao inclui {@code empresaId} nem {@code ativo}: a empresa e sempre
 * derivada do usuario autenticado (nunca informada pelo cliente) e o status
 * do produto e gerenciado apenas pelos endpoints dedicados de inativar e
 * reativar.
 *
 * <p>Os tamanhos maximos espelham exatamente as colunas definidas na migration
 * V3 ({@code nome VARCHAR(150)}, {@code categoria VARCHAR(100)},
 * {@code unidade VARCHAR(20)}, {@code codigo_barras VARCHAR(50)},
 * {@code sku VARCHAR(50)}).
 */
@Schema(description = "Dados para cadastro ou atualizacao de um produto")
public record ProdutoRequest(

        @Schema(example = "Arroz 5kg")
        @NotBlank(message = "Nome é obrigatório.")
        @Size(max = 150, message = "Nome deve ter no máximo 150 caracteres.")
        String nome,

        @Schema(example = "Mercearia")
        @Size(max = 100, message = "Categoria deve ter no máximo 100 caracteres.")
        String categoria,

        @Schema(example = "UN")
        @Size(max = 20, message = "Unidade deve ter no máximo 20 caracteres.")
        String unidade,

        @Schema(example = "25.90")
        @NotNull(message = "Preço de venda é obrigatório.")
        @DecimalMin(value = "0.0", message = "Preço de venda não pode ser negativo.")
        BigDecimal precoVenda,

        @Schema(example = "18.00")
        @DecimalMin(value = "0.0", message = "Custo não pode ser negativo.")
        BigDecimal custo,

        @Schema(example = "2")
        @DecimalMin(value = "0.0", message = "Estoque mínimo não pode ser negativo.")
        BigDecimal estoqueMinimo,

        @Schema(example = "7891234567890")
        @Size(max = 50, message = "Código de barras deve ter no máximo 50 caracteres.")
        String codigoBarras,

        @Schema(example = "SKU-001")
        @Size(max = 50, message = "SKU deve ter no máximo 50 caracteres.")
        String sku) {
}
