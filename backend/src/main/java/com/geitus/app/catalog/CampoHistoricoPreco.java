package com.geitus.app.catalog;

/**
 * Campo do produto cuja alteracao e registrada no historico de precos
 * ({@code produto_historico_precos.campo}, V8). Os nomes sao gravados como
 * texto e espelham o CHECK {@code ck_historico_preco_campo}.
 */
public enum CampoHistoricoPreco {
    CUSTO,
    PRECO_VENDA
}
