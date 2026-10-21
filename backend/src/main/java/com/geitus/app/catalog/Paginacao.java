package com.geitus.app.catalog;

/**
 * Limites das consultas paginadas do produto (historico de precos e
 * movimentos de estoque): pagina a partir de 0, tamanho de 1 a
 * {@value #TAMANHO_MAXIMO} e deslocamento ({@code pagina * tamanho}) que caiba
 * num {@code int}. Fora disso, 400 com mensagem fixa.
 */
public final class Paginacao {

    public static final int TAMANHO_MAXIMO = 100;

    static final String MENSAGEM_PAGINA_NEGATIVA = "A página deve ser maior ou igual a zero.";
    static final String MENSAGEM_TAMANHO_INVALIDO = "O tamanho da página deve ser entre 1 e 100.";
    static final String MENSAGEM_PAGINA_GRANDE_DEMAIS = "A página informada é grande demais.";

    private Paginacao() {
        // Apenas metodos estaticos.
    }

    /** Lanca {@link RegraDeNegocioException} (400) se a pagina ou o tamanho estiverem fora dos limites. */
    public static void validar(int pagina, int tamanho) {
        if (pagina < 0) {
            throw new RegraDeNegocioException(MENSAGEM_PAGINA_NEGATIVA);
        }
        if (tamanho < 1 || tamanho > TAMANHO_MAXIMO) {
            throw new RegraDeNegocioException(MENSAGEM_TAMANHO_INVALIDO);
        }
        // O deslocamento (pagina * tamanho) vira o OFFSET int da consulta; acima
        // disso o Spring Data falharia com 500.
        if ((long) pagina * tamanho > Integer.MAX_VALUE) {
            throw new RegraDeNegocioException(MENSAGEM_PAGINA_GRANDE_DEMAIS);
        }
    }
}
