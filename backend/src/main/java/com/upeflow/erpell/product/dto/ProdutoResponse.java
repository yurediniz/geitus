package com.upeflow.erpell.product.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.upeflow.erpell.product.Produto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica de um {@link Produto}.
 *
 * <p>Nao inclui {@code empresaId} nem a empresa: a empresa e implicita ao
 * usuario autenticado (ele so enxerga produtos da propria empresa), entao nao
 * ha necessidade de expor esse dado na resposta. A entidade JPA nunca deve ser
 * exposta diretamente na API (ver CLAUDE.md).
 */
@Schema(description = "Dados publicos de um produto")
public record ProdutoResponse(
        Long id,
        String nome,
        String categoria,
        String unidade,
        BigDecimal precoVenda,
        BigDecimal custo,
        BigDecimal estoqueMinimo,
        String codigoBarras,
        String sku,
        boolean ativo,
        LocalDateTime criadoEm,
        LocalDateTime atualizadoEm) {

    public static ProdutoResponse de(Produto produto) {
        return new ProdutoResponse(
                produto.getId(),
                produto.getNome(),
                produto.getCategoria(),
                produto.getUnidade(),
                produto.getPrecoVenda(),
                produto.getCusto(),
                produto.getEstoqueMinimo(),
                produto.getCodigoBarras(),
                produto.getSku(),
                produto.isAtivo(),
                produto.getCriadoEm(),
                produto.getAtualizadoEm());
    }
}
