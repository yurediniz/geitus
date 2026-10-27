package com.geitus.app.cashier.ponto.dto;

import java.math.BigDecimal;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Ponto de caixa na API (docs/modules/caixa.md). {@code id} e o UUID
 * publico (DEC-019). {@code ultimoFundoTroco} e o fundo da abertura anterior
 * (a sugestao da tela; {@code null} sem abertura) e {@code situacao}, o caixa
 * aberto no ponto ({@code null} quando livre).
 */
@Schema(description = "Ponto de caixa")
public record PontoDeCaixaResponse(
        UUID id,
        String nome,
        boolean ativo,
        @Schema(description = "Fundo de troco da abertura mais recente do ponto", example = "150.00")
        BigDecimal ultimoFundoTroco,
        SituacaoDoPontoResponse situacao) {
}
