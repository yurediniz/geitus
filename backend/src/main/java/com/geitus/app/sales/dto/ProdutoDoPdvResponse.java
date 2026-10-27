package com.geitus.app.sales.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * O produto como o PDV precisa (docs/modules/pdv.md): codigo, unidade,
 * preco vigente (sem atacado), saldo, miniatura e as embalagens com o preco
 * efetivo. Nunca traz o custo.
 */
@Schema(description = "Produto no PDV")
public record ProdutoDoPdvResponse(
        UUID id,
        @Schema(nullable = true) Integer codigo,
        String nome,
        @Schema(description = "Sigla da unidade de venda") String unidade,
        boolean fracionada,
        boolean controlaEstoque,
        BigDecimal saldo,
        @Schema(description = "Preco vigente da unidade, sem o atacado") BigDecimal precoVigente,
        @Schema(nullable = true) String miniaturaUrl,
        List<EmbalagemDoPdv> embalagens) {

    /** Embalagem de venda: rotulo, unidades por embalagem, sigla e preco efetivo. */
    @Schema(description = "Embalagem do produto no PDV")
    public record EmbalagemDoPdv(UUID id, String rotulo, BigDecimal quantidade, String unidade, BigDecimal preco) {
    }
}
