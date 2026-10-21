package com.geitus.app.inventory.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import com.geitus.app.inventory.MotivoMovimento;
import com.geitus.app.inventory.MovimentoEstoque;
import com.geitus.app.inventory.OrigemMovimento;
import com.geitus.app.inventory.TipoMovimento;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Um movimento de estoque, na resposta do ajuste e na aba Historico
 * (docs/modules/produtos-estoque.md, 5). O {@code id} e o UUID publico do
 * movimento; do usuario so sai o nome, nunca o id interno ou o e-mail.
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
        LocalDateTime criadoEm) {

    public static MovimentoEstoqueResponse de(MovimentoEstoque movimento, String usuarioNome) {
        return new MovimentoEstoqueResponse(movimento.getUuid(), movimento.getTipo(), movimento.getMotivo(),
                movimento.getOrigem(), movimento.getQuantidade(), movimento.getSaldoAnterior(),
                movimento.getSaldoNovo(), movimento.getObservacao(), usuarioNome, movimento.getCriadoEm());
    }
}
