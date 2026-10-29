package com.geitus.app.sales.venda.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.sales.venda.DestinoDaDevolucao;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Uma devolucao gravada (docs/modules/estoque.md, secao 6.2): quem devolveu,
 * quando (ISO-8601 no fuso {@code America/Sao_Paulo}), o motivo, o valor, as
 * linhas com o destino e o reembolso por forma. So ids publicos e nomes.
 */
@Schema(description = "Devolucao de itens de uma venda")
public record DevolucaoResponse(
        @Schema(description = "UUID da devolucao") UUID id,
        @Schema(description = "UUID da venda") UUID vendaId,
        long vendaNumero,
        BigDecimal valor,
        String motivo,
        OffsetDateTime criadaEm,
        String usuarioNome,
        List<ItemDevolvidoResponse> itens,
        @Schema(description = "Reembolso por forma; vazio na devolucao de valor zero")
        List<ReembolsoResponse> reembolsos) {

    /** Uma linha devolvida, com a unidade da linha ("CX c/ 12 UN" ou "UN"). */
    @Schema(description = "Linha devolvida")
    public record ItemDevolvidoResponse(int ordem, String nome, BigDecimal quantidade, String unidade,
            BigDecimal valor, DestinoDaDevolucao destino) {
    }

    @Schema(description = "Reembolso numa forma")
    public record ReembolsoResponse(FormaDePagamento forma, BigDecimal valor) {
    }
}
