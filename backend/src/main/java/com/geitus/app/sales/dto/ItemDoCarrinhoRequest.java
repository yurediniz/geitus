package com.geitus.app.sales.dto;

import java.math.BigDecimal;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Uma linha do carrinho (docs/modules/pdv.md). Na etiqueta
 * ({@code etiqueta: true}), o servidor le de novo os 13 digitos de
 * {@code codigoLido} e ignora a {@code quantidade} enviada.
 * {@code embalagemRotulo} e opcional e so serve para a mensagem quando a
 * embalagem nao existe mais ("A embalagem CX c/ 3 UN nao existe mais.").
 */
@Schema(description = "Linha do carrinho")
public record ItemDoCarrinhoRequest(
        @Schema(description = "UUID do produto")
        @NotNull(message = "Informe o produto.")
        UUID produtoId,

        @Schema(description = "UUID da embalagem; null na unidade e na etiqueta", nullable = true)
        UUID embalagemId,

        @Schema(description = "Na unidade da linha (3 CX, 1,250 KG); ignorada na etiqueta", example = "3")
        @Digits(integer = 9, fraction = 3, message = LimitesDoCarrinho.MENSAGEM_QUANTIDADE)
        BigDecimal quantidade,

        @Schema(description = "O texto lido (\"542*3\", o EAN ou a etiqueta); null na busca por nome", nullable = true)
        @Size(max = LimitesDoCarrinho.TAMANHO_DO_CODIGO_LIDO, message = LimitesDoCarrinho.MENSAGEM_CODIGO_LIDO_LONGO)
        String codigoLido,

        @Schema(description = "Linha de etiqueta de balança")
        Boolean etiqueta,

        @Valid
        DescontoRequest desconto,

        @Schema(description = "Rotulo da embalagem visto na tela (so para a mensagem)", nullable = true)
        @Size(max = LimitesDoCarrinho.TAMANHO_DO_ROTULO, message = "O rótulo da embalagem deve ter até 60 caracteres.")
        String embalagemRotulo) {

    public boolean ehEtiqueta() {
        return Boolean.TRUE.equals(etiqueta);
    }
}
