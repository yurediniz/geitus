package com.geitus.app.sales.configuracao.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Configuracao do PDV na API. Sem alteracao gravada, os padroes (vender sem
 * estoque ligado, 10,00%) e os demais campos {@code null}.
 */
@Schema(description = "Configuracao do PDV")
public record ConfiguracaoDoPdvResponse(
        boolean venderSemEstoque,
        BigDecimal descontoMaximoOperador,
        @Schema(nullable = true) String atualizadoPorNome,
        @Schema(description = "Ultima alteracao, ISO-8601 no fuso America/Sao_Paulo", nullable = true)
        OffsetDateTime atualizadoEm) {
}
