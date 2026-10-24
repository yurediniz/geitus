package com.geitus.app.sales.dto;

import java.util.List;
import java.util.UUID;

import com.geitus.app.sales.carrinho.DescontoInformado;
import com.geitus.app.sales.carrinho.PagamentoInformado;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * O carrinho do navegador, corpo do {@code POST /api/pdv/calculo}
 * (docs/modules/pdv.md, 5.3). Regras de quantidade, desconto e pagamento sao
 * conferidas no calculo, que responde 200 com os erros por campo; aqui so o
 * formato. O limite de 300 linhas tambem e do calculo; acima de 1.000 o corpo
 * e recusado.
 */
@Schema(description = "Carrinho do PDV")
public record CarrinhoRequest(
        @NotNull(message = "Informe os itens.")
        @Size(max = CarrinhoRequest.MAXIMO_DE_LINHAS_NO_CORPO, message = "A venda tem itens demais.")
        List<@NotNull(message = "Informe o item.") @Valid ItemDoCarrinhoRequest> itens,

        @Schema(description = "Desconto do total", nullable = true)
        @Valid
        DescontoRequest desconto,

        @Schema(description = "UUID do cliente (opcional)", nullable = true)
        UUID clienteId,

        @Size(max = CarrinhoRequest.MAXIMO_DE_PAGAMENTOS, message = "Use uma linha por forma de pagamento.")
        List<@NotNull(message = "Informe o pagamento.") @Valid PagamentoRequest> pagamentos) {

    static final int MAXIMO_DE_LINHAS_NO_CORPO = 1000;
    static final int MAXIMO_DE_PAGAMENTOS = 4;

    public DescontoInformado descontoDoTotal() {
        return desconto == null ? null : desconto.paraCalculo();
    }

    public List<PagamentoInformado> pagamentosParaCalculo() {
        return pagamentos == null ? List.of() : pagamentos.stream().map(PagamentoRequest::paraCalculo).toList();
    }
}
