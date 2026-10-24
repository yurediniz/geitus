package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.marca.Marca;
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
 *
 * <p>Fase C: promocao ({@code precoPromocional}, {@code promocaoInicio},
 * {@code promocaoFim}) e atacado ({@code precoAtacado},
 * {@code quantidadeMinimaAtacado}) vem todos preenchidos ou todos nulos em
 * cada bloco.
 *
 * <p>Fase D: {@code controlaEstoque} liga ou desliga o controle de estoque do
 * produto (o saldo em si nunca e um dado do cadastro).
 *
 * <p>Fase B3: a unidade de compra e o fator sairam; viraram a embalagem de
 * compra ({@link ProdutoEmbalagem}), que nao faz parte destes dados.
 *
 * <p>Fase B2: {@code codigo} (1 a 999999, ou {@code null}) e
 * {@code vendidoBalanca} (que exige o codigo). O numero de registro nao esta
 * aqui: e dado na criacao e nunca muda.
 *
 * <p>Fase B5: a marca e o item da arvore de marcas da empresa (o texto livre
 * saiu, com o fornecedor em texto); os fornecedores do produto sao uma lista
 * propria, fora destes dados.
 */
public record DadosProduto(
        String nome,
        String nomeCurto,
        Marca marca,
        String descricao,
        UnidadeMedida unidade,
        Categoria categoria,
        BigDecimal precoVenda,
        BigDecimal custo,
        BigDecimal precoMinimo,
        BigDecimal estoqueMinimo,
        BigDecimal estoqueMaximo,
        BigDecimal pontoReposicao,
        String sku,
        BigDecimal precoPromocional,
        LocalDate promocaoInicio,
        LocalDate promocaoFim,
        BigDecimal precoAtacado,
        BigDecimal quantidadeMinimaAtacado,
        boolean controlaEstoque,
        Integer codigo,
        boolean vendidoBalanca) {
}
