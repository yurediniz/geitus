package com.geitus.app.sales.dto;

import java.math.BigDecimal;
import java.util.List;

import com.geitus.app.sales.carrinho.CalculoDaVenda;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Resultado do {@code POST /api/pdv/calculo} (docs/modules/pdv.md): 200
 * mesmo com regras violadas, que vem em {@code erros} com o campo. Os
 * {@code avisos} nao impedem a venda ("Estoque insuficiente (saldo 2 UN)" com
 * "Vender sem estoque" ligada). Nunca traz o custo.
 */
@Schema(description = "Calculo do carrinho")
public record CalculoResponse(
        List<LinhaDoCalculoResponse> linhas,
        BigDecimal subtotal,
        BigDecimal descontoItens,
        BigDecimal descontoTotal,
        BigDecimal total,
        BigDecimal pago,
        BigDecimal troco,
        BigDecimal faltaPagar,
        List<ErroResponse> erros,
        List<ErroResponse> avisos) {

    public static CalculoResponse de(CalculoDaVenda calculo) {
        return new CalculoResponse(calculo.linhas().stream().map(LinhaDoCalculoResponse::de).toList(),
                calculo.subtotal(), calculo.descontoItens(), calculo.descontoTotal(), calculo.total(), calculo.pago(),
                calculo.troco(), calculo.faltaPagar(), calculo.erros().stream().map(ErroResponse::de).toList(),
                calculo.avisos().stream().map(ErroResponse::de).toList());
    }
}
