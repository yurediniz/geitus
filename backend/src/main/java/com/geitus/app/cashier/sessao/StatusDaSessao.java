package com.geitus.app.cashier.sessao;

/**
 * Situacao da sessao de caixa (docs/modules/caixa.md):
 * {@code ABERTA -> EM_CONFERENCIA -> FECHADA} ou {@code ABERTA -> FECHADA}
 * direto. Caixa fechado nao reabre (gatilho da V16).
 */
public enum StatusDaSessao {

    /** Recebe lancamentos; ainda nao foi contada. */
    ABERTA,
    /** Contada com diferenca, esperando a justificativa. */
    EM_CONFERENCIA,
    /** Contada e fechada; nada mais muda. */
    FECHADA;

    /** Ocupa o ponto e o usuario (indices parciais da V16). */
    public boolean emAndamento() {
        return this != FECHADA;
    }
}
