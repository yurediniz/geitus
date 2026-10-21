package com.geitus.app.shared.busca;

/**
 * Monta padroes {@code LIKE} seguros para as buscas por texto (DT-017).
 *
 * <p>O termo digitado e tratado como texto literal: o caractere de escape e os
 * curingas {@code %} e {@code _} sao escapados por {@code \}, e as queries devem
 * declarar {@code ESCAPE '\'}. Exemplo: o termo {@code 100%} vira o padrao
 * {@code %100\%%}. Nao altera maiusculas/minusculas: quem chama decide.
 */
public final class PadraoLike {

    private static final String CARACTERE_DE_ESCAPE = "\\";
    private static final String CURINGA_QUALQUER_SEQUENCIA = "%";
    private static final String CURINGA_UM_CARACTERE = "_";

    private PadraoLike() {
    }

    /**
     * Padrao "contem": escapa o caractere de escape e os curingas do termo
     * (nessa ordem, para nao escapar duas vezes a barra inserida) e envolve
     * com {@code %}. Termo vazio resulta em {@code %%}, que casa com qualquer
     * texto nao nulo.
     */
    public static String contem(String termo) {
        String escapado = termo
                .replace(CARACTERE_DE_ESCAPE, CARACTERE_DE_ESCAPE + CARACTERE_DE_ESCAPE)
                .replace(CURINGA_QUALQUER_SEQUENCIA, CARACTERE_DE_ESCAPE + CURINGA_QUALQUER_SEQUENCIA)
                .replace(CURINGA_UM_CARACTERE, CARACTERE_DE_ESCAPE + CURINGA_UM_CARACTERE);
        return CURINGA_QUALQUER_SEQUENCIA + escapado + CURINGA_QUALQUER_SEQUENCIA;
    }
}
