package com.geitus.app.shared.numeracao;

/**
 * Sequencias numeradas por empresa (coluna {@code numeracoes.tipo}, V11; o
 * CHECK {@code ck_numeracao_tipo}, refeito na V14 e na V17, lista os mesmos valores). A venda
 * (PDV, V17) e numerada por empresa como os cadastros.
 */
public enum TipoNumeracao {
    PRODUTO,
    CLIENTE,
    FORNECEDOR,
    VENDA
}
