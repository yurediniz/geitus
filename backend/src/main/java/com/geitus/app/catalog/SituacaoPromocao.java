package com.geitus.app.catalog;

import java.time.Clock;
import java.time.LocalDate;

/**
 * Situacao calculada de uma promocao (nao e coluna;
 * docs/modules/produtos.md). Inicio e fim sao inclusivos.
 */
public enum SituacaoPromocao {
    /** Hoje e antes do inicio. */
    AGENDADA,
    /** Hoje esta entre o inicio e o fim, inclusive. */
    VIGENTE,
    /** Hoje e depois do fim. */
    ENCERRADA;

    public static SituacaoPromocao de(LocalDate inicio, LocalDate fim, LocalDate hoje) {
        if (hoje.isBefore(inicio)) {
            return AGENDADA;
        }
        if (hoje.isAfter(fim)) {
            return ENCERRADA;
        }
        return VIGENTE;
    }

    /**
     * A data de hoje no fuso do relogio (o bean usa {@code America/Sao_Paulo}).
     * Unico ponto que converte o relogio em data para as regras de preco.
     */
    public static LocalDate hoje(Clock relogio) {
        return LocalDate.now(relogio);
    }
}
