package com.geitus.app.sales.dto;

import java.math.BigDecimal;

import com.geitus.app.sales.carrinho.DescontoInformado;
import com.geitus.app.sales.carrinho.TipoDesconto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/** Desconto do item ou do total; os limites sao conferidos no calculo (erro no campo). */
@Schema(description = "Desconto em percentual (0 a 100) ou em reais, com ate 2 casas")
public record DescontoRequest(
        @Schema(description = "PERCENTUAL ou VALOR")
        @NotNull(message = "Escolha o tipo do desconto.")
        TipoDesconto tipo,

        @Schema(example = "5")
        @NotNull(message = "Informe o desconto.")
        BigDecimal valor) {

    public DescontoInformado paraCalculo() {
        return new DescontoInformado(tipo, valor);
    }
}
