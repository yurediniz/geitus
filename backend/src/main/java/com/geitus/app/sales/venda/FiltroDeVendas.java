package com.geitus.app.sales.venda;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import com.geitus.app.sales.DadosDaVendaInvalidosException;

/**
 * Filtros da lista de vendas (docs/modules/pdv.md), todos opcionais. Sem
 * {@code sessaoId}, sem periodo e sem numero, vale a sessao atual do usuario;
 * com periodo e sem sessao, todas as sessoes que ele pode ver; com numero e
 * sem sessao, a venda daquele numero em qualquer data (o periodo e ignorado).
 * O periodo e de datas em {@code America/Sao_Paulo}, {@code ate} inclusive, e
 * tem no maximo 1 ano. {@code pontoId} e {@code vendedorId} so valem para o
 * ADMIN (o OPERADOR ve sempre so as proprias vendas).
 */
public record FiltroDeVendas(UUID sessaoId, StatusDaVenda status, LocalDate de, LocalDate ate, Long numero,
        UUID pontoId, Long vendedorId) {

    static final String MENSAGEM_PERIODO = "A data inicial não pode ser depois da final.";
    static final String MENSAGEM_PERIODO_LONGO = "O período pode ter no máximo 1 ano.";
    /** Como nas movimentacoes de estoque: de {@code de} a {@code ate}, inclusive, no maximo 366 dias. */
    static final int DIAS_DO_PERIODO_MAXIMO = 366;

    /** Filtro sem ponto e sem vendedor (o do F8 e o dos testes antigos). */
    public FiltroDeVendas(UUID sessaoId, StatusDaVenda status, LocalDate de, LocalDate ate, Long numero) {
        this(sessaoId, status, de, ate, numero, null, null);
    }

    void validar() {
        if (de != null && ate != null && de.isAfter(ate)) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_PERIODO, "de");
        }
        if (de != null && ate != null && ChronoUnit.DAYS.between(de, ate) >= DIAS_DO_PERIODO_MAXIMO) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_PERIODO_LONGO, "de");
        }
    }

    /** A sessao atual do usuario e o padrao quando nao ha sessao, periodo nem numero. */
    boolean usaASessaoAtual() {
        return sessaoId == null && de == null && ate == null && numero == null;
    }

    /** Numero sem sessao: a venda e procurada em qualquer data, sem o periodo. */
    private boolean numeroEmQualquerData() {
        return numero != null && sessaoId == null;
    }

    OffsetDateTime inicio(ZoneId fuso) {
        return de == null || numeroEmQualquerData() ? null : de.atStartOfDay(fuso).toOffsetDateTime();
    }

    OffsetDateTime fim(ZoneId fuso) {
        return ate == null || numeroEmQualquerData() ? null : ate.plusDays(1).atStartOfDay(fuso).toOffsetDateTime();
    }
}
