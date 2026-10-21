package com.geitus.app.inventory;

/**
 * Movimentos de um produto (projecao de {@link MovimentoEstoqueRepository#contagens}):
 * o total e quantos nao sao o estoque inicial do cadastro. O id e o interno.
 */
public record ContagemDeMovimentos(Long produtoId, Long total, Long naoIniciais) {
}
