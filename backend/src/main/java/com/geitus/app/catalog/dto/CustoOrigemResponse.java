package com.geitus.app.catalog.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.geitus.app.catalog.EntradaDeCompra;
import com.geitus.app.catalog.OrigemDoCusto;
import com.geitus.app.catalog.Produto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Origem do custo atual do produto (Fase B4, docs/modules/estoque.md):
 * "Ultimo custo de entrada ... (2 CX c/ 18 UN)" ou "Custo editado
 * manualmente em ...". A quantidade e a embalagem vem da ultima entrada por
 * compra e so na origem {@code ENTRADA_COMPRA}; na listagem de produtos nao
 * sao consultadas e saem nulas.
 */
@Schema(description = "De onde veio o custo atual do produto")
public record CustoOrigemResponse(
        @Schema(description = "ENTRADA_COMPRA ou EDICAO")
        OrigemDoCusto tipo,
        @Schema(description = "Quando a origem foi registrada")
        LocalDateTime em,
        @Schema(description = "Quantidade da ultima entrada por compra, em unidades de venda; null em EDICAO "
                + "e na listagem", example = "36.000")
        BigDecimal quantidade,
        @Schema(description = "Numero de embalagens da ultima compra; null em EDICAO, na listagem ou com a "
                + "compra em unidades", example = "2")
        Integer quantidadeDeEmbalagens,
        @Schema(description = "Rotulo da embalagem da ultima compra; null em EDICAO, na listagem ou com a "
                + "compra em unidades", example = "CX c/ 18 UN")
        String embalagemRotulo,
        @Schema(description = "Fase B5: fornecedor da ultima compra; null em EDICAO, na listagem ou com a compra "
                + "sem fornecedor", example = "Distribuidora Central Ltda")
        String fornecedorNome) {

    /**
     * A origem do produto ({@code null} sem origem), com o detalhe da
     * {@code ultimaCompra} so na origem {@code ENTRADA_COMPRA} ({@code null} =
     * sem detalhe).
     */
    public static CustoOrigemResponse deOuNulo(Produto produto, EntradaDeCompra ultimaCompra) {
        OrigemDoCusto tipo = produto.getCustoOrigem();
        if (tipo == null) {
            return null;
        }
        if (tipo != OrigemDoCusto.ENTRADA_COMPRA || ultimaCompra == null) {
            return new CustoOrigemResponse(tipo, produto.getCustoOrigemEm(), null, null, null, null);
        }
        return new CustoOrigemResponse(tipo, produto.getCustoOrigemEm(), ultimaCompra.quantidade(),
                ultimaCompra.quantidadeDeEmbalagens(), ultimaCompra.embalagemRotulo(), ultimaCompra.fornecedorNome());
    }
}
