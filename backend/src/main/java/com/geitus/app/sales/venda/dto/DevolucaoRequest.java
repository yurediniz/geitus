package com.geitus.app.sales.venda.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.sales.dto.LimitesDoCarrinho;
import com.geitus.app.sales.venda.DestinoDaDevolucao;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Devolucao de itens de uma venda ({@code POST /api/pdv/vendas/{id}/devolucoes};
 * docs/modules/estoque.md, secao 6.2): as linhas pela {@code ordem} na venda,
 * com a quantidade na unidade da linha e o destino; o reembolso por forma; o
 * motivo (aparado e conferido no service, ate 200) e a {@code chave} (UUID
 * gerado pela tela: repetir o mesmo pedido devolve a devolucao gravada).
 */
@Schema(description = "Devolucao de itens da venda")
public record DevolucaoRequest(
        @Schema(description = "Chave de idempotencia (UUID gerado pela tela)")
        @NotNull(message = "A chave da operação é obrigatória.")
        UUID chave,

        @Schema(description = "Motivo, de 1 a 200 caracteres", example = "Produto com defeito")
        String motivo,

        @NotNull(message = LimitesDoCarrinho.MENSAGEM_INFORME_OS_ITENS)
        @Size(max = LimitesDoCarrinho.MAXIMO_DE_LINHAS_NO_CORPO, message = LimitesDoCarrinho.MENSAGEM_ITENS_DEMAIS)
        List<@NotNull(message = LimitesDoCarrinho.MENSAGEM_INFORME_O_ITEM) @Valid ItemDevolvido> itens,

        @Schema(description = "Reembolso por forma; a soma e o valor da devolucao (vazio quando o valor e zero)")
        @Size(max = LimitesDoCarrinho.MAXIMO_DE_PAGAMENTOS, message = LimitesDoCarrinho.MENSAGEM_UMA_LINHA_POR_FORMA)
        List<@NotNull(message = LimitesDoCarrinho.MENSAGEM_INFORME_O_PAGAMENTO) @Valid ReembolsoInformado> reembolsos) {

    /** Uma linha devolvida. */
    @Schema(description = "Linha devolvida")
    public record ItemDevolvido(
            @Schema(description = "Ordem da linha na venda (1, 2, 3...)", example = "1")
            @NotNull(message = "Informe a linha da venda.")
            Integer ordem,

            @Schema(description = "Na unidade da linha (3 CX, 1,250 KG)", example = "1")
            @Digits(integer = 9, fraction = 3, message = LimitesDoCarrinho.MENSAGEM_QUANTIDADE)
            BigDecimal quantidade,

            @Schema(description = "ESTOQUE (volta ao estoque) ou AVARIADO")
            @NotNull(message = "Escolha o destino do item.")
            DestinoDaDevolucao destino) {
    }

    /** O reembolso numa forma que a venda recebeu. */
    @Schema(description = "Reembolso por forma")
    public record ReembolsoInformado(
            @Schema(description = "DINHEIRO, DEBITO, CREDITO ou PIX")
            @NotNull(message = "Escolha a forma do reembolso.")
            FormaDePagamento forma,

            @Schema(example = "24.90")
            @NotNull(message = "Informe o valor.")
            @Digits(integer = 10, fraction = 2, message = LimitesDoCarrinho.MENSAGEM_VALOR)
            BigDecimal valor) {
    }

    public List<ReembolsoInformado> reembolsosOuVazio() {
        return reembolsos == null ? List.of() : reembolsos;
    }
}
