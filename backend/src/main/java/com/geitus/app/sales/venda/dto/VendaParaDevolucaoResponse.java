package com.geitus.app.sales.venda.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.geitus.app.cashier.FormaDePagamento;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * A venda vista para a devolucao ({@code GET /api/pdv/devolucoes/venda?numero=};
 * docs/modules/estoque.md, secao 6.2): o que cada linha ainda pode devolver e o
 * que cada forma ainda pode reembolsar, mais as devolucoes ja feitas.
 */
@Schema(description = "Venda para devolucao")
public record VendaParaDevolucaoResponse(
        @Schema(description = "UUID da venda") UUID id,
        long numero,
        OffsetDateTime concluidaEm,
        String vendedorNome,
        @Schema(nullable = true) String clienteNome,
        BigDecimal total,
        BigDecimal troco,
        List<LinhaParaDevolucao> linhas,
        List<FormaParaReembolso> formas,
        List<DevolucaoResponse> devolucoes) {

    /**
     * Uma linha da venda: a unidade em que a quantidade conta (o rotulo da
     * embalagem ou a sigla), se aceita fracao, se e de etiqueta (so volta
     * inteira), o vendido, o devolvido e o disponivel, em quantidade e valor.
     */
    @Schema(description = "Linha da venda para devolucao")
    public record LinhaParaDevolucao(int ordem, String nome, String unidade,
            @Schema(nullable = true) String embalagemRotulo, boolean etiqueta, boolean fracionada,
            BigDecimal precoUnitario, BigDecimal quantidade, BigDecimal devolvida, BigDecimal disponivel,
            BigDecimal valorLiquido, BigDecimal valorDisponivel) {
    }

    /** Uma forma que a venda recebeu: o recebido (no dinheiro, sem o troco), o ja reembolsado e o disponivel. */
    @Schema(description = "Forma de pagamento para reembolso")
    public record FormaParaReembolso(FormaDePagamento forma, BigDecimal recebido, BigDecimal reembolsado,
            BigDecimal disponivel) {
    }
}
