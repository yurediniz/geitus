package com.geitus.app.sales.dto;

import java.math.BigDecimal;

import com.geitus.app.sales.carrinho.DescontoInformado;
import com.geitus.app.sales.carrinho.TipoDesconto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

/**
 * Desconto do item ou do total. O formato (ate 10 digitos inteiros e 2 casas)
 * e conferido aqui; os limites (a base em R$, 100 no percentual) no calculo,
 * com o erro no campo.
 */
@Schema(description = "Desconto em percentual (0 a 100) ou em reais, com ate 2 casas")
public record DescontoRequest(
        @Schema(description = "PERCENTUAL ou VALOR")
        @NotNull(message = "Escolha o tipo do desconto.")
        TipoDesconto tipo,

        @Schema(example = "5")
        @NotNull(message = "Informe o desconto.")
        @Digits(integer = 10, fraction = 2, message = LimitesDoCarrinho.MENSAGEM_VALOR)
        BigDecimal valor) {

    public DescontoInformado paraCalculo() {
        return new DescontoInformado(tipo, valor);
    }
}
