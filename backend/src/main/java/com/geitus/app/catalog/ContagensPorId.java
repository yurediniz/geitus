package com.geitus.app.catalog;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Converte o resultado de uma contagem agrupada por id (linhas
 * {@code [id, quantidade]} de query nativa) em mapa {@code id -> quantidade}.
 * Ids ausentes significam quantidade zero.
 */
public final class ContagensPorId {

    private static final int COLUNA_ID = 0;
    private static final int COLUNA_QUANTIDADE = 1;

    private ContagensPorId() {
        // Apenas metodos estaticos.
    }

    public static Map<Long, Long> de(List<Object[]> linhas) {
        Map<Long, Long> contagens = new HashMap<>();
        for (Object[] linha : linhas) {
            contagens.put(((Number) linha[COLUNA_ID]).longValue(), ((Number) linha[COLUNA_QUANTIDADE]).longValue());
        }
        return contagens;
    }
}
