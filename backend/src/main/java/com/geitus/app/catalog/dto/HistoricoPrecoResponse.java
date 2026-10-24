package com.geitus.app.catalog.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.geitus.app.catalog.CampoHistoricoPreco;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Uma alteracao de custo ou preco de venda na aba Historico
 * (docs/modules/produtos-precos.md, 5). Montada direto pela consulta do
 * {@code HistoricoPrecoRepository}: so o nome do usuario sai, nunca o id
 * interno ou o e-mail.
 */
@Schema(description = "Alteracao de custo ou de preco de venda do produto")
public record HistoricoPrecoResponse(
        @Schema(description = "CUSTO, PRECO_VENDA ou PRECO_EMBALAGEM")
        CampoHistoricoPreco campo,
        @Schema(description = "Valor antes da alteracao; null no cadastro ou quando o custo estava vazio")
        BigDecimal valorAnterior,
        @Schema(description = "Valor depois da alteracao; null quando o custo foi removido")
        BigDecimal valorNovo,
        @Schema(description = "Rotulo da embalagem no momento da alteracao (so em PRECO_EMBALAGEM)",
                example = "CX c/ 3 UN")
        String embalagemRotulo,
        @Schema(description = "Nome do usuario que fez a alteracao")
        String usuarioNome,
        LocalDateTime alteradoEm) {
}
