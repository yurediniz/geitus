package com.geitus.app.catalog;

/**
 * Campo do produto cuja alteracao e registrada no historico de precos
 * ({@code produto_historico_precos.campo}, V8). Os nomes sao gravados como
 * texto e espelham o CHECK {@code ck_historico_preco_campo}.
 *
 * <p>{@code PRECO_EMBALAGEM} (V12, Fase B3): o preco proprio de uma
 * embalagem, com o rotulo da embalagem no momento da alteracao.
 */
public enum CampoHistoricoPreco {
    CUSTO,
    PRECO_VENDA,
    PRECO_EMBALAGEM
}
