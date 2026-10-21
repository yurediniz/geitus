package com.geitus.app.catalog;

import java.math.BigDecimal;

/**
 * O que o catalogo precisa saber do estoque de um produto
 * (docs/modules/produtos-estoque.md, 4.7): o saldo guardado e quantos
 * movimentos ele tem, separando o estoque inicial do cadastro dos demais.
 *
 * @param saldo saldo atual (0 sem movimentos), mesmo com o controle desligado
 * @param totalMovimentos quantidade de movimentos do produto
 * @param movimentosNaoIniciais movimentos que nao sao o estoque inicial do cadastro
 */
public record ResumoDeEstoque(BigDecimal saldo, long totalMovimentos, long movimentosNaoIniciais) {

    /** Produto que nunca movimentou: saldo 0 e nenhum movimento. */
    public static final ResumoDeEstoque VAZIO = new ResumoDeEstoque(BigDecimal.ZERO, 0, 0);

    public boolean temMovimentos() {
        return totalMovimentos > 0;
    }

    /**
     * Exclusao fisica permitida: sem movimentos ou so com o estoque inicial do
     * cadastro (produto cadastrado por engano).
     */
    public boolean permiteExcluir() {
        return movimentosNaoIniciais == 0;
    }
}
