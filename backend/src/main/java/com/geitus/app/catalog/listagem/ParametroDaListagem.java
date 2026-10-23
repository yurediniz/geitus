package com.geitus.app.catalog.listagem;

import java.util.function.Function;
import java.util.function.Supplier;

/**
 * Leitura dos parametros de texto da listagem que viram enums (status,
 * estoque, ordem): allow-list exata, sem diferenciar espacos nas pontas.
 */
final class ParametroDaListagem {

    private ParametroDaListagem() {
    }

    /** Parametro nao enviado ou so com espacos: vale o padrao. */
    static boolean ausente(String valor) {
        return valor == null || valor.isBlank();
    }

    /** O valor cujo nome na API e exatamente o recebido (aparado); senao, a excecao de 400. */
    static <T> T escolher(T[] valores, Function<T, String> nomeNaApi, String recebido,
            Supplier<? extends RuntimeException> invalido) {
        String aparado = recebido.strip();
        for (T valor : valores) {
            if (nomeNaApi.apply(valor).equals(aparado)) {
                return valor;
            }
        }
        throw invalido.get();
    }
}
