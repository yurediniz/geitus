package com.geitus.app.inventory.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import com.geitus.app.inventory.MotivoMovimento;
import com.geitus.app.inventory.MovimentoEstoque;
import com.geitus.app.inventory.OrigemMovimento;
import com.geitus.app.inventory.RetratoDaEmbalagem;
import com.geitus.app.inventory.TipoMovimento;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Um movimento de estoque, na resposta do ajuste e na aba Historico
 * (docs/modules/produtos-estoque.md, 5). O {@code id} e o UUID publico do
 * movimento; do usuario so sai o nome, nunca o id interno ou o e-mail.
 *
 * <p>Fase B3 (docs/modules/produtos-embalagens.md, 6): {@code embalagem} traz o
 * retrato da embalagem quando o ajuste foi informado em embalagens; senao
 * {@code null}. A {@code quantidade} continua em unidades de venda.
 *
 * <p>Fase B4 (docs/modules/produtos-custo-entrada.md, 6): a entrada por compra
 * traz {@code custoInformado} e {@code custoUnitario}.
 */
@Schema(description = "Movimento de estoque do produto")
public record MovimentoEstoqueResponse(
        @Schema(description = "Identificador publico (UUID)")
        UUID id,
        TipoMovimento tipo,
        MotivoMovimento motivo,
        @Schema(description = "AJUSTE_MANUAL, CADASTRO (estoque inicial) ou VENDA (reservado ao PDV)")
        OrigemMovimento origem,
        @Schema(description = "Variacao com sinal: positiva na entrada, negativa na saida", example = "-2.000")
        BigDecimal quantidade,
        @Schema(example = "12.000")
        BigDecimal saldoAnterior,
        @Schema(example = "10.000")
        BigDecimal saldoNovo,
        @Schema(description = "Observacao; null se nao houver")
        String observacao,
        @Schema(description = "Nome do usuario que registrou o movimento")
        String usuarioNome,
        LocalDateTime criadoEm,
        @Schema(description = "Retrato da embalagem do ajuste informado em embalagens; null se em unidades")
        EmbalagemDoMovimento embalagem,
        @Schema(description = "Fase B4: custo digitado na entrada por compra (de 1 unidade, ou de 1 embalagem com o "
                + "retrato); null nos demais movimentos e nas compras anteriores a Fase B4", example = "180.00")
        BigDecimal custoInformado,
        @Schema(description = "Fase B4: custo por unidade de venda, com 4 casas; null junto com custoInformado",
                example = "10.0000")
        BigDecimal custoUnitario) {

    /** Retrato da embalagem no movimento ("+36 UN (2 CX c/ 18 UN)"). */
    @Schema(description = "Embalagem em que o ajuste foi informado")
    public record EmbalagemDoMovimento(
            @Schema(example = "CX c/ 18 UN")
            String rotulo,
            @Schema(description = "Unidades de venda por embalagem", example = "18.000")
            BigDecimal quantidadePorEmbalagem,
            @Schema(description = "Numero de embalagens informado", example = "2")
            int quantidadeDeEmbalagens) {

        static EmbalagemDoMovimento deOuNulo(RetratoDaEmbalagem retrato) {
            return retrato == null
                    ? null
                    : new EmbalagemDoMovimento(retrato.rotulo(), retrato.quantidadePorEmbalagem(),
                            retrato.quantidadeDeEmbalagens());
        }
    }

    /**
     * Construtor da consulta paginada ({@code MovimentoEstoqueRepository}): as
     * colunas do retrato chegam soltas (nulas no movimento em unidades).
     */
    public MovimentoEstoqueResponse(UUID id, TipoMovimento tipo, MotivoMovimento motivo, OrigemMovimento origem,
            BigDecimal quantidade, BigDecimal saldoAnterior, BigDecimal saldoNovo, String observacao,
            String usuarioNome, LocalDateTime criadoEm, String embalagemRotulo, BigDecimal embalagemQuantidade,
            Integer quantidadeEmbalagens, BigDecimal custoInformado, BigDecimal custoUnitario) {
        this(id, tipo, motivo, origem, quantidade, saldoAnterior, saldoNovo, observacao, usuarioNome, criadoEm,
                embalagemRotulo == null
                        ? null
                        : new EmbalagemDoMovimento(embalagemRotulo, embalagemQuantidade, quantidadeEmbalagens),
                custoInformado, custoUnitario);
    }

    public static MovimentoEstoqueResponse de(MovimentoEstoque movimento, String usuarioNome) {
        return new MovimentoEstoqueResponse(movimento.getUuid(), movimento.getTipo(), movimento.getMotivo(),
                movimento.getOrigem(), movimento.getQuantidade(), movimento.getSaldoAnterior(),
                movimento.getSaldoNovo(), movimento.getObservacao(), usuarioNome, movimento.getCriadoEm(),
                EmbalagemDoMovimento.deOuNulo(movimento.getRetratoDaEmbalagem().orElse(null)),
                movimento.getCustoInformado(), movimento.getCustoUnitario());
    }
}
