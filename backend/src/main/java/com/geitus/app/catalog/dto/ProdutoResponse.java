package com.geitus.app.catalog.dto;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;

import com.geitus.app.catalog.Produto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica de um {@link Produto}.
 *
 * <p>Nao inclui {@code empresaId} nem a empresa: a empresa e implicita ao
 * usuario autenticado (ele so enxerga produtos da propria empresa), entao nao
 * ha necessidade de expor esse dado na resposta. A entidade JPA nunca deve ser
 * exposta diretamente na API (ver CLAUDE.md).
 *
 * <p>{@code margem} e {@code markup} sao derivados (nao tem coluna): calculados
 * a partir de {@code precoVenda} e {@code custo}, alinhados ao principio
 * "calcular automaticamente" do CLAUDE.md. Ambos ficam {@code null} quando o
 * custo (ou o preco, para a margem) nao permite o calculo.
 */
@Schema(description = "Dados publicos de um produto")
public record ProdutoResponse(
        Long id,
        String nome,
        String categoria,
        String marca,
        String unidade,
        String descricao,
        BigDecimal precoVenda,
        BigDecimal custo,
        BigDecimal precoMinimo,
        BigDecimal estoqueMinimo,
        BigDecimal estoqueMaximo,
        BigDecimal pontoReposicao,
        String codigoBarras,
        String sku,
        boolean ativo,
        @Schema(description = "Margem sobre a venda em %: (preco - custo) / preco * 100. Null se sem custo/preco.")
        BigDecimal margem,
        @Schema(description = "Marcacao sobre o custo em %: (preco - custo) / custo * 100. Null se sem custo.")
        BigDecimal markup,
        LocalDateTime criadoEm,
        LocalDateTime atualizadoEm) {

    private static final BigDecimal CEM = new BigDecimal("100");
    private static final int CASAS_PERCENTUAL = 2;

    public static ProdutoResponse de(Produto produto) {
        BigDecimal preco = produto.getPrecoVenda();
        BigDecimal custo = produto.getCusto();
        return new ProdutoResponse(
                produto.getId(),
                produto.getNome(),
                produto.getCategoria(),
                produto.getMarca(),
                produto.getUnidade(),
                produto.getDescricao(),
                preco,
                custo,
                produto.getPrecoMinimo(),
                produto.getEstoqueMinimo(),
                produto.getEstoqueMaximo(),
                produto.getPontoReposicao(),
                produto.getCodigoBarras(),
                produto.getSku(),
                produto.isAtivo(),
                calcularMargem(preco, custo),
                calcularMarkup(preco, custo),
                produto.getCriadoEm(),
                produto.getAtualizadoEm());
    }

    /**
     * Margem sobre a venda: (preco - custo) / preco * 100. Exige custo informado
     * e preco > 0 (evita divisao por zero).
     */
    private static BigDecimal calcularMargem(BigDecimal preco, BigDecimal custo) {
        if (custo == null || preco == null || preco.signum() <= 0) {
            return null;
        }
        return preco.subtract(custo)
                .multiply(CEM)
                .divide(preco, CASAS_PERCENTUAL, RoundingMode.HALF_UP);
    }

    /**
     * Marcacao sobre o custo: (preco - custo) / custo * 100. Exige custo > 0
     * (evita divisao por zero).
     */
    private static BigDecimal calcularMarkup(BigDecimal preco, BigDecimal custo) {
        if (preco == null || custo == null || custo.signum() <= 0) {
            return null;
        }
        return preco.subtract(custo)
                .multiply(CEM)
                .divide(custo, CASAS_PERCENTUAL, RoundingMode.HALF_UP);
    }
}
