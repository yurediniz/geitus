package com.geitus.app.sales.venda.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.sales.carrinho.OrigemPrecoDaVenda;
import com.geitus.app.sales.venda.SituacaoDeDevolucao;
import com.geitus.app.sales.venda.StatusDaVenda;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Venda na API (docs/modules/pdv.md). Horarios em ISO-8601 no fuso
 * {@code America/Sao_Paulo}. Nunca traz o custo.
 *
 * <ul>
 *   <li>{@code itens}: no detalhe e nas respostas de finalizar e cancelar;
 *       ausente na lista;</li>
 *   <li>{@code cancelamento}: {@code null} na venda concluida;</li>
 *   <li>{@code podeCancelar}: concluida, sem devolucao, com o caixa da venda
 *       aberto, e quem consulta e o dono da sessao ou ADMIN;</li>
 *   <li>{@code situacaoDevolucao}: na lista e no detalhe;</li>
 *   <li>{@code devolucoes}: no detalhe e nas respostas de finalizar e
 *       cancelar (docs/modules/pdv.md, regras 24 a 29); ausente na lista.</li>
 * </ul>
 */
@Schema(description = "Venda do PDV")
public record VendaResponse(
        UUID id,
        long numero,
        StatusDaVenda status,
        @Schema(description = "UUID da sessao de caixa") UUID sessaoId,
        String pontoNome,
        String vendedorNome,
        @Schema(nullable = true) String clienteNome,
        BigDecimal subtotal,
        BigDecimal descontoItens,
        BigDecimal descontoTotal,
        BigDecimal total,
        BigDecimal troco,
        OffsetDateTime concluidaEm,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @Schema(description = "Itens; ausente na lista")
        List<ItemDaVendaResponse> itens,
        List<PagamentoResponse> pagamentos,
        @Schema(nullable = true) CancelamentoResponse cancelamento,
        boolean podeCancelar,
        @Schema(description = "NENHUMA, PARCIAL ou TOTAL (na lista e no detalhe)")
        SituacaoDeDevolucao situacaoDevolucao,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @Schema(description = "Devolucoes da venda, da mais antiga; ausente na lista")
        List<DevolucaoResponse> devolucoes) {

    /** Item da venda, a fotografia gravada (sem o custo). */
    @Schema(description = "Item da venda")
    public record ItemDaVendaResponse(int ordem, String nome, @Schema(nullable = true) String codigoLido,
            @Schema(nullable = true) String embalagemRotulo, boolean etiqueta, BigDecimal quantidade,
            String unidade, BigDecimal precoUnitario, OrigemPrecoDaVenda origemPreco, BigDecimal valorBruto,
            BigDecimal descontoItem, BigDecimal descontoRateado, BigDecimal valorLiquido) {
    }

    /** Pagamento por forma (no dinheiro, o valor entregue; o troco esta na venda). */
    @Schema(description = "Pagamento da venda")
    public record PagamentoResponse(FormaDePagamento forma, BigDecimal valor) {
    }

    /** Quem cancelou, quando e o motivo. */
    @Schema(description = "Cancelamento da venda")
    public record CancelamentoResponse(String canceladaPorNome, OffsetDateTime canceladaEm, String motivo) {
    }
}
