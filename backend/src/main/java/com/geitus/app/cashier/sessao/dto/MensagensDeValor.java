package com.geitus.app.cashier.sessao.dto;

/** Mensagens de validacao repetidas nos pedidos do caixa (constantes para as anotacoes). */
final class MensagensDeValor {

    static final String ATE_DUAS_CASAS = "Informe um valor com até 2 casas decimais e no máximo 9.999.999.999,99.";
    static final String CHAVE_OBRIGATORIA = "A chave da operação é obrigatória.";
    static final String JUSTIFICATIVA_LONGA = "A justificativa deve ter até 500 caracteres.";
    static final int TAMANHO_MAXIMO_DA_JUSTIFICATIVA = 500;

    private MensagensDeValor() {
        // Apenas constantes.
    }
}
