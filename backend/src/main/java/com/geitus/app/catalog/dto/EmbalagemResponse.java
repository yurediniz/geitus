package com.geitus.app.catalog.dto;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

import com.geitus.app.catalog.MargemEMarkup;
import com.geitus.app.catalog.OrigemPrecoEmbalagem;
import com.geitus.app.catalog.PrecoAplicado;
import com.geitus.app.catalog.PrecoDaEmbalagem;
import com.geitus.app.catalog.ProdutoEmbalagem;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Embalagem do produto na resposta (docs/modules/produtos.md).
 * O {@code id} e o UUID publico; {@code rotulo}, {@code precoEfetivo},
 * {@code custo}, {@code margem} e {@code markup} sao derivados.
 */
@Schema(description = "Embalagem do produto")
public record EmbalagemResponse(
        @Schema(description = "Identificador publico (UUID)")
        UUID id,
        UnidadeResumo unidade,
        @Schema(description = "Unidades de venda contidas na embalagem", example = "3.000")
        BigDecimal quantidade,
        @Schema(example = "CX c/ 3 UN")
        String rotulo,
        @Schema(description = "Preco proprio; null = preco calculado")
        BigDecimal preco,
        @Schema(description = "Preco que vale hoje: o proprio ou quantidade x preco vigente da unidade",
                example = "209.90")
        BigDecimal precoEfetivo,
        @Schema(description = "PROPRIO, UNIDADE ou PROMOCAO_DA_UNIDADE")
        OrigemPrecoEmbalagem origemPreco,
        @Schema(description = "Quantidade x custo da unidade; null sem custo", example = "150.00")
        BigDecimal custo,
        @Schema(description = "Margem do preco efetivo sobre o custo da embalagem, em %; null sem custo")
        BigDecimal margem,
        @Schema(description = "Markup do preco efetivo sobre o custo da embalagem, em %; null sem custo")
        BigDecimal markup,
        boolean deCompra,
        @Schema(description = "Codigos de barras da embalagem na ordem")
        List<CodigoBarrasResponse> codigosBarras) {

    private static final int CASAS_DO_REAL = 2;

    /**
     * @param custoDaUnidade o custo do produto (por unidade de venda), ou {@code null}
     * @param vigenteDaUnidade o preco da unidade sem o atacado, calculado uma vez por produto
     */
    public static EmbalagemResponse de(ProdutoEmbalagem embalagem, BigDecimal custoDaUnidade,
            PrecoAplicado vigenteDaUnidade) {
        PrecoDaEmbalagem efetivo = PrecoDaEmbalagem.calcular(embalagem.getPreco(), embalagem.getQuantidade(),
                vigenteDaUnidade);
        BigDecimal custo = custoDaUnidade == null
                ? null
                : embalagem.getQuantidade().multiply(custoDaUnidade).setScale(CASAS_DO_REAL, RoundingMode.HALF_UP);
        return new EmbalagemResponse(
                embalagem.getUuid(),
                UnidadeResumo.deOuNulo(embalagem.getUnidade()),
                embalagem.getQuantidade(),
                embalagem.rotulo(),
                embalagem.getPreco(),
                efetivo.preco(),
                efetivo.origem(),
                custo,
                MargemEMarkup.margem(efetivo.preco(), custo),
                MargemEMarkup.markup(efetivo.preco(), custo),
                embalagem.isDeCompra(),
                embalagem.getCodigosBarras().stream().map(CodigoBarrasResponse::de).toList());
    }
}
