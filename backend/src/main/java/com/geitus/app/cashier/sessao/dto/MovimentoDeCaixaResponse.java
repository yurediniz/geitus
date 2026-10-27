package com.geitus.app.cashier.sessao.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.cashier.sessao.TipoDeMovimentoDeCaixa;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Movimento da sessao na API: valor sempre positivo (o sinal sai do tipo),
 * forma, quem lancou e quando. O {@code valor} e {@code null} para o OPERADOR
 * no modo cego, com a sessao aberta, quando o lancamento e de outra pessoa ou
 * e um recebimento ou estorno de venda (docs/modules/caixa.md;
 * docs/modules/pdv.md). {@code vendaNumero}: o numero da venda do
 * recebimento ou do estorno ({@code null} nos movimentos da gaveta).
 */
@Schema(description = "Movimento de caixa")
public record MovimentoDeCaixaResponse(
        UUID id,
        TipoDeMovimentoDeCaixa tipo,
        @Schema(description = "DINHEIRO na abertura, suprimento e sangria; a forma do recebimento ou do estorno")
        FormaDePagamento forma,
        @Schema(description = "Valor; null para o OPERADOR no modo cego, com a sessao aberta, em lancamento de "
                + "outra pessoa ou de venda", nullable = true)
        BigDecimal valor,
        @Schema(description = "Motivo; null na abertura") String motivo,
        String usuarioNome,
        @Schema(description = "ISO-8601 no fuso America/Sao_Paulo") OffsetDateTime criadoEm,
        @Schema(description = "Numero da venda do recebimento ou do estorno; null na gaveta", nullable = true)
        Long vendaNumero) {
}
