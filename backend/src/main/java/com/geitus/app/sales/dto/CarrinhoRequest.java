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
 * formato ({@link LimitesDoCarrinho}): o limite de 300 linhas e do calculo, e
 * o corpo aceita uma a mais para a mensagem sair de la; acima disso, 400.
 */
@Schema(description = "Carrinho do PDV")
public record CarrinhoRequest(
        @NotNull(message = LimitesDoCarrinho.MENSAGEM_INFORME_OS_ITENS)
        @Size(max = LimitesDoCarrinho.MAXIMO_DE_LINHAS_NO_CORPO, message = LimitesDoCarrinho.MENSAGEM_ITENS_DEMAIS)
        List<@NotNull(message = LimitesDoCarrinho.MENSAGEM_INFORME_O_ITEM) @Valid ItemDoCarrinhoRequest> itens,

        @Schema(description = "Desconto do total", nullable = true)
        @Valid
        DescontoRequest desconto,

        @Schema(description = "UUID do cliente (opcional)", nullable = true)
        UUID clienteId,

        @Size(max = LimitesDoCarrinho.MAXIMO_DE_PAGAMENTOS, message = LimitesDoCarrinho.MENSAGEM_UMA_LINHA_POR_FORMA)
        List<@NotNull(message = LimitesDoCarrinho.MENSAGEM_INFORME_O_PAGAMENTO) @Valid PagamentoRequest> pagamentos) {

    public DescontoInformado descontoDoTotal() {
        return desconto == null ? null : desconto.paraCalculo();
    }

    public List<PagamentoInformado> pagamentosParaCalculo() {
        return pagamentos == null ? List.of() : pagamentos.stream().map(PagamentoRequest::paraCalculo).toList();
    }
}
