package com.geitus.app.shared.numeracao;

/**
 * Sequencias numeradas por empresa (coluna {@code numeracoes.tipo}, V11; o
 * CHECK {@code ck_numeracao_tipo}, refeito na V14, lista os mesmos valores). A venda entra aqui
 * quando o PDV existir.
 */
public enum TipoNumeracao {
    PRODUTO,
    CLIENTE,
    FORNECEDOR
}
