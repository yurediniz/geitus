package com.geitus.app.cashier.configuracao.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** Alteracao do modo de fechamento do caixa (ADMIN). */
@Schema(description = "Configuracao do caixa")
public record ConfiguracaoDoCaixaRequest(
        @Schema(description = "true: quem fecha informa o contado sem ver o esperado", example = "true")
        @NotNull(message = "Informe se o fechamento é cego.")
        Boolean fechamentoCego) {
}
