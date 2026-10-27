package com.geitus.app.sales.venda;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.UUID;

import com.geitus.app.sales.DadosDaVendaInvalidosException;

/**
 * Filtros da lista de vendas (docs/modules/pdv.md), todos opcionais. Sem
 * {@code sessaoId} e sem periodo, vale a sessao atual do usuario; com periodo
 * e sem sessao, todas as sessoes que ele pode ver. O periodo e de datas em
 * {@code America/Sao_Paulo}, {@code ate} inclusive.
 */
public record FiltroDeVendas(UUID sessaoId, StatusDaVenda status, LocalDate de, LocalDate ate, Long numero) {

    static final String MENSAGEM_PERIODO = "A data inicial não pode ser depois da final.";

    void validar() {
        if (de != null && ate != null && de.isAfter(ate)) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_PERIODO, "de");
        }
    }

    /** A sessao atual do usuario e o padrao quando nao ha sessao nem periodo. */
    boolean usaASessaoAtual() {
        return sessaoId == null && de == null && ate == null;
    }

    OffsetDateTime inicio(ZoneId fuso) {
        return de == null ? null : de.atStartOfDay(fuso).toOffsetDateTime();
    }

    OffsetDateTime fim(ZoneId fuso) {
        return ate == null ? null : ate.plusDays(1).atStartOfDay(fuso).toOffsetDateTime();
    }
}
