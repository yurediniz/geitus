package com.geitus.app.sales.dto;

import java.math.BigDecimal;
import java.util.UUID;

import com.geitus.app.sales.carrinho.LinhaCalculada;
import com.geitus.app.sales.carrinho.OrigemPrecoDaVenda;

import io.swagger.v3.oas.annotations.media.Schema;

/** Linha calculada pelo servidor; nunca traz o custo. */
@Schema(description = "Linha do carrinho calculada")
public record LinhaDoCalculoResponse(
        @Schema(description = "Posicao no carrinho, a partir de 1") int ordem,
        UUID produtoId,
        @Schema(nullable = true) UUID embalagemId,
        boolean etiqueta,
        @Schema(nullable = true) String codigoLido,
        String nome,
        @Schema(nullable = true) String embalagemRotulo,
        @Schema(description = "Sigla da linha (a da embalagem ou a da unidade de venda)") String unidade,
        @Schema(description = "Na unidade da linha") BigDecimal quantidade,
        @Schema(description = "O que a linha baixa, na unidade de venda") BigDecimal quantidadeEstoque,
        BigDecimal precoUnitario,
        OrigemPrecoDaVenda origemPreco,
        BigDecimal valorBruto,
        BigDecimal descontoItem,
        BigDecimal descontoRateado,
        BigDecimal valorLiquido) {

    static LinhaDoCalculoResponse de(LinhaCalculada linha) {
        return new LinhaDoCalculoResponse(linha.ordem(), linha.produto().getUuid(),
                linha.embalagem() == null ? null : linha.embalagem().getUuid(), linha.etiqueta(), linha.codigoLido(),
                linha.produto().getNome(), linha.embalagem() == null ? null : linha.embalagem().rotulo(),
                linha.sigla(), linha.quantidade(), linha.quantidadeEstoque(), linha.precoUnitario(), linha.origem(),
                linha.valorBruto(), linha.descontoItem(), linha.descontoRateado(), linha.valorLiquido());
    }
}
