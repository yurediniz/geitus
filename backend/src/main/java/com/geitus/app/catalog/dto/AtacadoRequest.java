package com.geitus.app.catalog.dto;

import java.math.BigDecimal;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

/**
 * Preco de atacado do produto, uma unica faixa (docs/modules/produtos-precos.md,
 * 4.4 e 5): preco e quantidade minima juntos. O bloco nulo ou ausente no
 * request significa "sem atacado". As demais regras (maior que 1, fracao pela
 * unidade de venda, comparacoes de preco) ficam no {@code ProdutoService}.
 *
 * <p>Os erros chegam em {@code campos} com as chaves aninhadas
 * {@code atacado.preco} e {@code atacado.quantidadeMinima}.
 */
@Schema(description = "Preco de atacado a partir de uma quantidade minima")
public record AtacadoRequest(
        @Schema(example = "4.20")
        @NotNull(message = "Informe o preço de atacado.")
        @Digits(integer = 10, fraction = 2, message = "Preço de atacado deve ter no máximo 2 casas decimais.")
        BigDecimal preco,

        @Schema(description = "Quantidade (na unidade de venda) a partir da qual o atacado vale; maior que 1",
                example = "12")
        @NotNull(message = "Informe a quantidade mínima do atacado.")
        @Digits(integer = 9, fraction = 3,
                message = "A quantidade mínima do atacado deve ter no máximo 3 casas decimais.")
        BigDecimal quantidadeMinima) {
}
