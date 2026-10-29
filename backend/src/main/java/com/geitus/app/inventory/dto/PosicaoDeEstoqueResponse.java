package com.geitus.app.inventory.dto;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.SituacaoEstoque;
import com.geitus.app.catalog.categoria.CategoriaArvore;

/**
 * Linha da posicao de estoque (spec de Estoque, regra 22). Nunca expoe
 * {@code empresaId} nem a entidade.
 *
 * @param saldo              saldo atual, com 3 casas (sem linha de saldo = 0)
 * @param situacao           situacao calculada ({@link SituacaoEstoque#de})
 * @param valorEmCusto       saldo x custo a centavos (meio para cima); {@code null} sem custo ou com saldo &lt;= 0
 * @param embalagemPrincipal a de compra ou a primeira, para a conversao do saldo; {@code null} sem embalagem
 */
public record PosicaoDeEstoqueResponse(UUID id, Long numero, Integer codigo, String nome, Unidade unidade,
        Categoria categoria, boolean ativo, BigDecimal saldo, SituacaoEstoque situacao, BigDecimal estoqueMinimo,
        BigDecimal pontoReposicao, BigDecimal estoqueMaximo, BigDecimal custo, BigDecimal valorEmCusto,
        Embalagem embalagemPrincipal) {

    public record Unidade(String sigla, boolean fracionada) {
    }

    public record Categoria(String caminho) {
    }

    public record Embalagem(String sigla, BigDecimal quantidade) {
    }

    /** Monta a linha com o produto (unidade, categoria e embalagens ja carregadas) e o saldo. */
    public static PosicaoDeEstoqueResponse de(Produto produto, BigDecimal saldo, CategoriaArvore categorias) {
        BigDecimal saldoAtual = saldo.setScale(3, RoundingMode.HALF_UP);
        Categoria categoria = produto.getCategoria() == null ? null
                : new Categoria(categorias.caminho(produto.getCategoria().getId()));
        Embalagem embalagem = produto.embalagemPrincipal()
                .map(principal -> new Embalagem(principal.getUnidade().getSigla(), principal.getQuantidade()))
                .orElse(null);
        return new PosicaoDeEstoqueResponse(produto.getUuid(), produto.getNumero(), produto.getCodigo(),
                produto.getNome(), new Unidade(produto.getUnidade().getSigla(), produto.getUnidade().isFracionada()),
                categoria, produto.isAtivo(), saldoAtual,
                SituacaoEstoque.de(true, saldoAtual, produto.getPontoReposicao(), produto.getEstoqueMinimo(),
                        produto.getEstoqueMaximo()),
                produto.getEstoqueMinimo(), produto.getPontoReposicao(), produto.getEstoqueMaximo(), produto.getCusto(),
                valorEmCusto(saldoAtual, produto.getCusto()), embalagem);
    }

    /** Regra 22: so com custo e saldo positivo. */
    public static BigDecimal valorEmCusto(BigDecimal saldo, BigDecimal custo) {
        if (custo == null || saldo.signum() <= 0) {
            return null;
        }
        return saldo.multiply(custo).setScale(2, RoundingMode.HALF_UP);
    }
}
