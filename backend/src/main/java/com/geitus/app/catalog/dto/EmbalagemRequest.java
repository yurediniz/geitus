package com.geitus.app.catalog.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Uma embalagem na lista completa do produto
 * (docs/modules/produtos-embalagens.md, 2 e 7). {@code id} identifica a
 * embalagem que continua; sem {@code id}, a embalagem e nova. As regras que
 * dependem do produto (unidade diferente da de venda, quantidade &gt; 1,
 * fracao, repeticao, uma de compra, preco minimo e unicidade dos codigos)
 * ficam no {@code EmbalagensDoProduto}, com os erros em
 * {@code embalagens[j].campo}.
 */
@Schema(description = "Embalagem do produto (outra forma de vender ou comprar, com estoque unico)")
public record EmbalagemRequest(

        @Schema(description = "UUID da embalagem que continua; ausente = embalagem nova")
        UUID id,

        @Schema(description = "UUID da unidade da embalagem (diferente da unidade de venda)")
        @NotNull(message = "Informe a unidade da embalagem.")
        UUID unidadeId,

        @Schema(description = "Unidades de venda contidas na embalagem (maior que 1; fracao so em unidade de venda "
                + "fracionada)", example = "3")
        @NotNull(message = "Informe a quantidade da embalagem.")
        @Digits(integer = 9, fraction = 3,
                message = "A quantidade da embalagem deve ter no máximo 9 dígitos inteiros e 3 casas decimais.")
        BigDecimal quantidade,

        @Schema(description = "Preco proprio (opcional); ausente = quantidade x preco vigente da unidade",
                example = "209.90")
        @DecimalMin(value = "0", inclusive = false, message = "O preço da embalagem deve ser maior que zero.")
        @Digits(integer = 10, fraction = 2, message = "O preço da embalagem deve ter no máximo 2 casas decimais.")
        BigDecimal preco,

        @Schema(description = "Se e a embalagem de compra (no maximo uma por produto)", example = "false")
        boolean deCompra,

        @Schema(description = "Codigos de barras da embalagem (ate 5), na ordem", example = "[\"7891000315507\"]")
        @Size(max = 5, message = "Informe no máximo 5 códigos de barras por embalagem.")
        List<@Size(max = 50, message = "Código de barras deve ter no máximo 50 caracteres.") String> codigosBarras) {
}
