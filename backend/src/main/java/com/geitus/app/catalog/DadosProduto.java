package com.geitus.app.catalog;

import java.math.BigDecimal;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.unidade.UnidadeMedida;

/**
 * Dados editaveis do cadastro de um {@link Produto}, ja normalizados e
 * validados pelo {@code ProdutoService} (textos aparados, vazio virando
 * {@code null}; unidade/categoria resolvidas dentro da empresa).
 *
 * <p>Agrupa os campos para que a entidade receba um unico argumento na criacao
 * e na edicao, em vez de uma lista longa de parametros posicionais. Os codigos
 * de barras ficam fora: sao uma colecao propria, trocada por
 * {@link Produto#substituirCodigos}.
 */
public record DadosProduto(
        String nome,
        String nomeCurto,
        String marca,
        String fornecedor,
        String descricao,
        UnidadeMedida unidade,
        Categoria categoria,
        UnidadeMedida unidadeCompra,
        BigDecimal fatorConversao,
        BigDecimal precoVenda,
        BigDecimal custo,
        BigDecimal precoMinimo,
        BigDecimal estoqueMinimo,
        BigDecimal estoqueMaximo,
        BigDecimal pontoReposicao,
        String sku) {
}
