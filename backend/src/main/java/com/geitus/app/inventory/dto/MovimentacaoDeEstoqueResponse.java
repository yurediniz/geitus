package com.geitus.app.inventory.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import com.geitus.app.inventory.MotivoMovimento;
import com.geitus.app.inventory.OrigemMovimento;
import com.geitus.app.inventory.TipoMovimento;
import com.geitus.app.inventory.dto.MovimentoEstoqueResponse.EmbalagemDoMovimento;
import com.geitus.app.inventory.dto.MovimentoEstoqueResponse.FornecedorDoMovimento;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Uma linha da aba Movimentacoes da area Estoque (docs/modules/estoque.md,
 * regras 26 e 27): os campos do {@link MovimentoEstoqueResponse} mais o produto
 * e, no movimento de venda, cancelamento ou devolucao, a venda. So ids publicos (UUID) e
 * o nome do usuario saem; nunca ids internos ou e-mail.
 */
@Schema(description = "Movimento de estoque com o produto, na lista de movimentacoes da empresa")
public record MovimentacaoDeEstoqueResponse(
        @Schema(description = "Identificador publico do movimento (UUID)")
        UUID id,
        TipoMovimento tipo,
        MotivoMovimento motivo,
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
        @Schema(description = "Custo digitado na entrada por compra; null nos demais movimentos", example = "180.00")
        BigDecimal custoInformado,
        @Schema(description = "Custo por unidade de venda, com 4 casas; null junto com custoInformado",
                example = "10.0000")
        BigDecimal custoUnitario,
        @Schema(description = "Fornecedor da entrada por compra; null sem fornecedor")
        FornecedorDoMovimento fornecedor,
        ProdutoDaMovimentacao produto,
        @Schema(description = "Venda da baixa, do cancelamento ou da devolucao; null nos demais movimentos")
        VendaDaMovimentacao venda) {

    @Schema(description = "Produto do movimento")
    public record ProdutoDaMovimentacao(
            @Schema(description = "Identificador publico do produto (UUID)")
            UUID id,
            @Schema(example = "15")
            long numero,
            @Schema(example = "Arroz 5 kg")
            String nome,
            UnidadeDaMovimentacao unidade) {
    }

    @Schema(description = "Unidade de venda do produto (as quantidades estao nela)")
    public record UnidadeDaMovimentacao(
            @Schema(example = "UN")
            String sigla,
            boolean fracionada) {
    }

    @Schema(description = "Venda ligada ao movimento")
    public record VendaDaMovimentacao(
            @Schema(description = "Identificador publico da venda (UUID)")
            UUID id,
            @Schema(example = "123")
            long numero) {

        static VendaDaMovimentacao deOuNulo(UUID id, Long numero) {
            return id == null ? null : new VendaDaMovimentacao(id, numero);
        }
    }

    /**
     * Construtor da consulta ({@code ConsultaDasMovimentacoes}): as colunas do
     * retrato, do fornecedor e da venda chegam soltas (nulas quando nao ha).
     */
    @SuppressWarnings("java:S107") // Uma coluna por parametro, como o construtor da consulta do MovimentoEstoqueResponse.
    public static MovimentacaoDeEstoqueResponse daLinha(UUID id, TipoMovimento tipo, MotivoMovimento motivo,
            OrigemMovimento origem, BigDecimal quantidade, BigDecimal saldoAnterior, BigDecimal saldoNovo,
            String observacao, String usuarioNome, LocalDateTime criadoEm, String embalagemRotulo,
            BigDecimal embalagemQuantidade, Integer quantidadeEmbalagens, BigDecimal custoInformado,
            BigDecimal custoUnitario, UUID fornecedorId, String fornecedorNome, ProdutoDaMovimentacao produto,
            UUID vendaId, Long vendaNumero) {
        return new MovimentacaoDeEstoqueResponse(id, tipo, motivo, origem, quantidade, saldoAnterior, saldoNovo,
                observacao, usuarioNome, criadoEm,
                embalagemRotulo == null
                        ? null
                        : new EmbalagemDoMovimento(embalagemRotulo, embalagemQuantidade, quantidadeEmbalagens),
                custoInformado, custoUnitario,
                fornecedorId == null ? null : new FornecedorDoMovimento(fornecedorId, fornecedorNome),
                produto, VendaDaMovimentacao.deOuNulo(vendaId, vendaNumero));
    }
}
