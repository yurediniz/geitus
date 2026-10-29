package com.geitus.app.sales.venda;

/**
 * Para onde vai o item devolvido ({@code itens_devolucao.destino}, V19;
 * docs/modules/estoque.md, secao 6.2, regra 6). So o item que baixou estoque
 * na venda gera movimento.
 */
public enum DestinoDaDevolucao {
    /** Volta ao estoque: so a entrada. */
    ESTOQUE,
    /** Avariado: a entrada e a saida por perda, e o saldo termina onde estava. */
    AVARIADO
}
