package com.geitus.app.catalog.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

/**
 * Promocao do produto no cadastro (docs/modules/produtos.md):
 * preco, inicio e fim juntos. O bloco nulo ou ausente no request significa
 * "sem promocao". As comparacoes com o preco de venda, o preco minimo e o
 * periodo ficam no {@code ProdutoService}.
 *
 * <p>Os erros chegam em {@code campos} com as chaves aninhadas
 * {@code promocao.preco}, {@code promocao.inicio} e {@code promocao.fim}.
 */
@Schema(description = "Preco promocional com vigencia por datas (inicio e fim inclusivos)")
public record PromocaoRequest(
        @Schema(example = "8.90")
        @NotNull(message = "Informe o preço promocional.")
        @Digits(integer = 10, fraction = 2, message = "Preço promocional deve ter no máximo 2 casas decimais.")
        BigDecimal preco,

        @Schema(description = "Primeiro dia da promocao", example = "2026-11-01")
        @NotNull(message = "Informe o início da promoção.")
        LocalDate inicio,

        @Schema(description = "Ultimo dia da promocao", example = "2026-11-15")
        @NotNull(message = "Informe o fim da promoção.")
        LocalDate fim) {
}
