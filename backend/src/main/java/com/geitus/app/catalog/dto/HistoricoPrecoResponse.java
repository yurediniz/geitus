package com.geitus.app.catalog.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.geitus.app.catalog.CampoHistoricoPreco;
import com.geitus.app.catalog.EntradaDeCompra;
import com.geitus.app.catalog.OrigemDoCusto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Uma alteracao de custo ou preco de venda na aba Historico
 * (docs/modules/produtos-precos.md, 5): so o nome do usuario sai, nunca o id
 * interno ou o e-mail.
 *
 * <p>Fase B4 (docs/modules/produtos-custo-entrada.md, 3 e 6): as linhas de
 * custo trazem a {@code origem} e, na entrada por compra, a {@code entrada}
 * ligada (quantidade e embalagem). O id do movimento nunca sai.
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
        LocalDateTime alteradoEm,
        @Schema(description = "Fase B4: EDICAO ou ENTRADA_COMPRA nas linhas de CUSTO; null nas demais")
        OrigemDoCusto origem,
        @Schema(description = "Fase B4: a entrada por compra que mudou o custo; so na origem ENTRADA_COMPRA")
        EntradaResponse entrada) {

    /** Quantidade e embalagem da entrada por compra ligada a uma linha de custo. */
    @Schema(description = "Entrada por compra ligada a linha de custo")
    public record EntradaResponse(
            @Schema(description = "Em unidades de venda", example = "36.000")
            BigDecimal quantidade,
            @Schema(description = "Numero de embalagens; null com a compra em unidades", example = "2")
            Integer quantidadeDeEmbalagens,
            @Schema(description = "Rotulo da embalagem; null com a compra em unidades", example = "CX c/ 18 UN")
            String embalagemRotulo) {

        public static EntradaResponse deOuNulo(EntradaDeCompra entrada) {
            return entrada == null
                    ? null
                    : new EntradaResponse(entrada.quantidade(), entrada.quantidadeDeEmbalagens(),
                            entrada.embalagemRotulo());
        }
    }
}
