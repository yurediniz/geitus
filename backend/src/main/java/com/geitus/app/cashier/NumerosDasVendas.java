package com.geitus.app.cashier;

import java.util.Collection;
import java.util.Map;

/**
 * O numero das vendas dos movimentos {@code RECEBIMENTO} e {@code ESTORNO}, que
 * a lista de movimentos do caixa mostra ("Venda nº 128"; docs/modules/pdv.md,
 * 6.5). Declarada aqui e implementada pelo PDV ({@code sales}), para que o
 * caixa nao dependa da venda; sem implementacao, os movimentos saem sem o
 * numero.
 */
public interface NumerosDasVendas {

    /** Numero de cada venda da empresa com estes ids internos, numa consulta; id de outra empresa fica fora. */
    Map<Long, Long> porIds(Long empresaId, Collection<Long> vendaIds);
}
