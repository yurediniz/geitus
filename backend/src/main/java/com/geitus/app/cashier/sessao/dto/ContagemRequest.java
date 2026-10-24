package com.geitus.app.cashier.sessao.dto;

import java.math.BigDecimal;
import java.util.Map;

import com.geitus.app.cashier.FormaDePagamento;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Contagem do caixa por forma de pagamento (docs/modules/pdv.md, 3.9 e 5.3):
 * {@code { "contagens": { "DINHEIRO": 318.00, "DEBITO": 120.00 }, "justificativa": null }}.
 * O dinheiro e sempre contado; Debito, Credito e PIX, quando tiveram movimento
 * na sessao ({@code formasDaContagem} da sessao). Cada valor (de 0 a
 * 9.999.999.999,99, ate 2 casas) e conferido no service, com o erro no campo
 * {@code contagens.{FORMA}}. A justificativa e uma so e so vale no modo nao
 * cego, para fechar direto quando alguma forma tem diferenca.
 */
@Schema(description = "Contagem do caixa por forma de pagamento")
public record ContagemRequest(
        @Schema(description = "Valor contado por forma: DINHEIRO sempre; DEBITO, CREDITO e PIX quando tiveram "
                + "movimento", example = "{\"DINHEIRO\": 318.00, \"DEBITO\": 120.00}")
        @NotNull(message = "Informe os valores contados.")
        Map<FormaDePagamento, BigDecimal> contagens,

        @Schema(description = "Justificativa da diferenca (so no modo nao cego), ate 500 caracteres")
        @Size(max = MensagensDeValor.TAMANHO_MAXIMO_DA_JUSTIFICATIVA, message = MensagensDeValor.JUSTIFICATIVA_LONGA)
        String justificativa) {
}
