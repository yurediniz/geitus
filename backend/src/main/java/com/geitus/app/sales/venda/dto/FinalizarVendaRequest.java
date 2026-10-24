package com.geitus.app.sales.venda.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import com.geitus.app.sales.dto.CarrinhoRequest;
import com.geitus.app.sales.dto.DescontoRequest;
import com.geitus.app.sales.dto.ItemDoCarrinhoRequest;
import com.geitus.app.sales.dto.PagamentoRequest;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Finalizacao da venda ({@code POST /api/pdv/vendas}; docs/modules/pdv.md,
 * 3.6 e 5.3): o carrinho mais a {@code chave} (UUID gerado ao abrir o
 * pagamento; repetir o mesmo pedido devolve a venda gravada) e o
 * {@code totalEsperado} (o total que a tela mostrou; se o recalculo der outro,
 * 409 "O total da venda mudou.").
 */
@Schema(description = "Finalizacao da venda")
public record FinalizarVendaRequest(
        @NotNull(message = "Informe os itens.")
        @Size(max = 1000, message = "A venda tem itens demais.")
        List<@NotNull(message = "Informe o item.") @Valid ItemDoCarrinhoRequest> itens,

        @Schema(nullable = true)
        @Valid
        DescontoRequest desconto,

        @Schema(nullable = true)
        UUID clienteId,

        @Size(max = 4, message = "Use uma linha por forma de pagamento.")
        List<@NotNull(message = "Informe o pagamento.") @Valid PagamentoRequest> pagamentos,

        @Schema(description = "Chave de idempotencia (UUID gerado pela tela)")
        @NotNull(message = "A chave da operação é obrigatória.")
        UUID chave,

        @Schema(description = "O total que a tela mostrou", example = "71.50")
        @NotNull(message = "Informe o total esperado.")
        BigDecimal totalEsperado) {

    public CarrinhoRequest carrinho() {
        return new CarrinhoRequest(itens, desconto, clienteId, pagamentos == null ? List.of() : pagamentos);
    }
}
