package com.geitus.app.cashier.sessao.dto;

/** Mensagens de validacao repetidas nos pedidos do caixa (constantes para as anotacoes). */
public final class MensagensDeValor {

    public static final String ATE_DUAS_CASAS = "Informe um valor com até 2 casas decimais e no máximo 9.999.999.999,99.";
    public static final String CHAVE_OBRIGATORIA = "A chave da operação é obrigatória.";
    public static final String JUSTIFICATIVA_LONGA = "A justificativa deve ter até 500 caracteres.";
    public static final int TAMANHO_MAXIMO_DA_JUSTIFICATIVA = 500;

    private MensagensDeValor() {
        // Apenas constantes.
    }
}
