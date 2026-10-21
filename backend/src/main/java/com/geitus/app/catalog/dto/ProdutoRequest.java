package com.geitus.app.catalog.dto;

import java.math.BigDecimal;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
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
 * <p>Unidade de venda, categoria e unidade de compra sao referenciadas pelo
 * UUID publico do cadastro correspondente (docs/modules/categorias-e-unidades.md,
 * 5.2); o service confirma que pertencem a empresa do usuario (404 se nao).
 *
 * <p>Os tamanhos maximos e a precisao numerica espelham as colunas das
 * migrations V3/V4/V6 ({@code nome VARCHAR(150)}, {@code marca VARCHAR(100)},
 * {@code descricao VARCHAR(1000)}, {@code codigo_barras}/{@code sku VARCHAR(50)},
 * {@code preco_venda}/{@code custo}/{@code preco_minimo NUMERIC(12,2)},
 * {@code estoque_minimo}/{@code estoque_maximo}/{@code ponto_reposicao NUMERIC(12,3)},
 * {@code fator_conversao NUMERIC(12,4)}). O {@code @Digits} garante um 400
 * amigavel em vez de um erro de banco quando o cliente envia casas a mais.
 */
@Schema(description = "Dados para cadastro ou atualizacao de um produto")
public record ProdutoRequest(

        @Schema(example = "Arroz 5kg")
        @NotBlank(message = "Nome é obrigatório.")
        @Size(max = 150, message = "Nome deve ter no máximo 150 caracteres.")
        String nome,

        @Schema(example = "Tio João")
        @Size(max = 100, message = "Marca deve ter no máximo 100 caracteres.")
        String marca,

        @Schema(example = "Arroz branco tipo 1, pacote de 5kg.")
        @Size(max = 1000, message = "Descrição deve ter no máximo 1000 caracteres.")
        String descricao,

        @Schema(description = "UUID da unidade de venda (obrigatoria)")
        @NotNull(message = "Unidade é obrigatória.")
        UUID unidadeId,

        @Schema(description = "UUID da categoria (opcional)")
        UUID categoriaId,

        @Schema(description = "UUID da unidade de compra (opcional; exige fatorConversao)")
        UUID unidadeCompraId,

        @Schema(description = "Quantas unidades de venda cabem em 1 unidade de compra (exige unidadeCompraId)",
                example = "12")
        @DecimalMin(value = "0", inclusive = false, message = "Fator de conversão deve ser maior que zero.")
        @Digits(integer = 8, fraction = 4, message = "Fator de conversão deve ter no máximo 4 casas decimais.")
        BigDecimal fatorConversao,

        @Schema(example = "25.90")
        @NotNull(message = "Preço de venda é obrigatório.")
        @DecimalMin(value = "0.0", message = "Preço de venda não pode ser negativo.")
        @Digits(integer = 10, fraction = 2, message = "Preço de venda deve ter no máximo 2 casas decimais.")
        BigDecimal precoVenda,

        @Schema(example = "18.00")
        @DecimalMin(value = "0.0", message = "Custo não pode ser negativo.")
        @Digits(integer = 10, fraction = 2, message = "Custo deve ter no máximo 2 casas decimais.")
        BigDecimal custo,

        @Schema(example = "2")
        @DecimalMin(value = "0.0", message = "Estoque mínimo não pode ser negativo.")
        @Digits(integer = 9, fraction = 3, message = "Estoque mínimo deve ter no máximo 3 casas decimais.")
        BigDecimal estoqueMinimo,

        @Schema(example = "50")
        @DecimalMin(value = "0.0", message = "Estoque máximo não pode ser negativo.")
        @Digits(integer = 9, fraction = 3, message = "Estoque máximo deve ter no máximo 3 casas decimais.")
        BigDecimal estoqueMaximo,

        @Schema(example = "10")
        @DecimalMin(value = "0.0", message = "Ponto de reposição não pode ser negativo.")
        @Digits(integer = 9, fraction = 3, message = "Ponto de reposição deve ter no máximo 3 casas decimais.")
        BigDecimal pontoReposicao,

        @Schema(example = "20.00")
        @DecimalMin(value = "0.0", message = "Preço mínimo não pode ser negativo.")
        @Digits(integer = 10, fraction = 2, message = "Preço mínimo deve ter no máximo 2 casas decimais.")
        BigDecimal precoMinimo,

        @Schema(example = "7891234567890")
        @Size(max = 50, message = "Código de barras deve ter no máximo 50 caracteres.")
        String codigoBarras,

        @Schema(example = "SKU-001")
        @Size(max = 50, message = "SKU deve ter no máximo 50 caracteres.")
        String sku) {
}
