package com.geitus.app.cashier.configuracao.dto;

import java.time.OffsetDateTime;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Configuracao do caixa na API (docs/modules/caixa.md, 5.2). Sem alteracao
 * gravada, {@code fechamentoCego} e o padrao ({@code true}) e os demais campos
 * sao {@code null}.
 */
@Schema(description = "Configuracao do caixa")
public record ConfiguracaoDoCaixaResponse(
        boolean fechamentoCego,
        String atualizadoPorNome,
        @Schema(description = "Ultima alteracao, ISO-8601 no fuso America/Sao_Paulo") OffsetDateTime atualizadoEm) {
}
