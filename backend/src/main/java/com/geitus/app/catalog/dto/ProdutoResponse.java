package com.geitus.app.catalog.dto;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;

import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.unidade.UnidadeMedida;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica de um {@link Produto}.
 *
 * <p>Nao inclui {@code empresaId} nem a empresa: a empresa e implicita ao
 * usuario autenticado (ele so enxerga produtos da propria empresa), entao nao
 * ha necessidade de expor esse dado na resposta. A entidade JPA nunca deve ser
 * exposta diretamente na API (ver CLAUDE.md).
 *
 * <p>Unidade de venda, categoria e unidade de compra saem como resumos com o
 * UUID publico ({@link UnidadeResumo}, {@link CategoriaResumo}); o caminho da
 * categoria vem da {@link CategoriaArvore} da empresa, montada uma vez por
 * requisicao pelo service (nao uma vez por produto).
 *
 * <p>{@code margem} e {@code markup} sao derivados (nao tem coluna): calculados
 * a partir de {@code precoVenda} e {@code custo}, alinhados ao principio
 * "calcular automaticamente" do CLAUDE.md. Ambos ficam {@code null} quando o
 * custo (ou o preco, para a margem) nao permite o calculo. {@code conversaoTexto}
 * tambem e derivado: {@code "1 CX = 12 UN"} (fator sem zeros a direita, virgula
 * decimal pt-BR), ou {@code null} sem unidade de compra.
 */
@Schema(description = "Dados publicos de um produto")
public record ProdutoResponse(
        Long id,
        String nome,
        @Schema(description = "Categoria com o caminho na arvore; null se sem categoria")
        CategoriaResumo categoria,
        String marca,
        @Schema(description = "Unidade de venda")
        UnidadeResumo unidade,
        @Schema(description = "Unidade de compra; null se nao houver")
        UnidadeResumo unidadeCompra,
        @Schema(description = "Unidades de venda em 1 unidade de compra; null se nao houver unidade de compra")
        BigDecimal fatorConversao,
        @Schema(description = "Conversao de compra legivel; null se nao houver unidade de compra",
                example = "1 CX = 12 UN")
        String conversaoTexto,
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

    /**
     * Monta a resposta do produto. {@code arvore} e a arvore de categorias da
     * empresa do produto (so e consultada quando o produto tem categoria).
     */
    public static ProdutoResponse de(Produto produto, CategoriaArvore arvore) {
        BigDecimal preco = produto.getPrecoVenda();
        BigDecimal custo = produto.getCusto();
        return new ProdutoResponse(
                produto.getId(),
                produto.getNome(),
                CategoriaResumo.deOuNulo(produto.getCategoria(), arvore),
                produto.getMarca(),
                UnidadeResumo.deOuNulo(produto.getUnidade()),
                UnidadeResumo.deOuNulo(produto.getUnidadeCompra()),
                produto.getFatorConversao(),
                conversaoTexto(produto.getUnidade(), produto.getUnidadeCompra(), produto.getFatorConversao()),
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
     * Texto da conversao de compra, ex.: {@code "1 CX = 12 UN"} ou
     * {@code "1 FD = 1,5 KG"}. {@code null} sem unidade de compra.
     */
    private static String conversaoTexto(UnidadeMedida unidade, UnidadeMedida unidadeCompra, BigDecimal fator) {
        if (unidadeCompra == null || fator == null) {
            return null;
        }
        return "1 " + unidadeCompra.getSigla() + " = " + formatarFator(fator) + " " + unidade.getSigla();
    }

    /** Fator sem zeros a direita e com virgula decimal (pt-BR): 12.0000 → "12", 1.5000 → "1,5". */
    private static String formatarFator(BigDecimal fator) {
        return fator.stripTrailingZeros().toPlainString().replace('.', ',');
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
