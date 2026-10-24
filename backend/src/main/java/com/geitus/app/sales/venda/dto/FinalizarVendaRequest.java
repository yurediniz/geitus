package com.geitus.app.sales.venda.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import com.geitus.app.sales.dto.CarrinhoRequest;
import com.geitus.app.sales.dto.DescontoRequest;
import com.geitus.app.sales.dto.ItemDoCarrinhoRequest;
import com.geitus.app.sales.dto.LimitesDoCarrinho;
import com.geitus.app.sales.dto.PagamentoRequest;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Finalizacao da venda ({@code POST /api/pdv/vendas}; docs/modules/pdv.md,
 * 3.6 e 5.3): o carrinho, com o mesmo formato e os mesmos limites do
 * {@link CarrinhoRequest} ({@link LimitesDoCarrinho}), mais a {@code chave}
 * (UUID gerado ao abrir o pagamento; repetir o mesmo pedido devolve a venda
 * gravada) e o {@code totalEsperado} (o total que a tela mostrou; se o
 * recalculo der outro, 409 "O total da venda mudou.").
 */
@Schema(description = "Finalizacao da venda")
public record FinalizarVendaRequest(
        @NotNull(message = LimitesDoCarrinho.MENSAGEM_INFORME_OS_ITENS)
        @Size(max = LimitesDoCarrinho.MAXIMO_DE_LINHAS_NO_CORPO, message = LimitesDoCarrinho.MENSAGEM_ITENS_DEMAIS)
        List<@NotNull(message = LimitesDoCarrinho.MENSAGEM_INFORME_O_ITEM) @Valid ItemDoCarrinhoRequest> itens,

        @Schema(nullable = true)
        @Valid
        DescontoRequest desconto,

        @Schema(nullable = true)
        UUID clienteId,

        @Size(max = LimitesDoCarrinho.MAXIMO_DE_PAGAMENTOS, message = LimitesDoCarrinho.MENSAGEM_UMA_LINHA_POR_FORMA)
        List<@NotNull(message = LimitesDoCarrinho.MENSAGEM_INFORME_O_PAGAMENTO) @Valid PagamentoRequest> pagamentos,

        @Schema(description = "Chave de idempotencia (UUID gerado pela tela)")
        @NotNull(message = "A chave da operação é obrigatória.")
        UUID chave,

        @Schema(description = "O total que a tela mostrou", example = "71.50")
        @NotNull(message = "Informe o total esperado.")
        @Digits(integer = 10, fraction = 2, message = LimitesDoCarrinho.MENSAGEM_VALOR)
        BigDecimal totalEsperado) {

    public CarrinhoRequest carrinho() {
        return new CarrinhoRequest(itens, desconto, clienteId, pagamentos == null ? List.of() : pagamentos);
    }
}
