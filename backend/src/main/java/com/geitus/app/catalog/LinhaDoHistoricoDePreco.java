package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;

import com.geitus.app.catalog.dto.HistoricoPrecoResponse;
import com.geitus.app.catalog.dto.HistoricoPrecoResponse.EntradaResponse;

/**
 * Linha da consulta paginada do historico de precos
 * ({@link HistoricoPrecoRepository#historicoDoProduto}): os dados da resposta
 * e o id interno do movimento da entrada por compra (Fase B4), que nao sai na
 * API e so serve para buscar as entradas da pagina em lote.
 */
public record LinhaDoHistoricoDePreco(CampoHistoricoPreco campo, BigDecimal valorAnterior, BigDecimal valorNovo,
        String embalagemRotulo, String usuarioNome, LocalDateTime alteradoEm, OrigemDoCusto origem,
        Long movimentoId) {

    /**
     * A resposta da API com a entrada ligada, procurada nas {@code entradas} da
     * pagina pelo id do movimento ({@code null} fora da origem
     * {@code ENTRADA_COMPRA}).
     */
    HistoricoPrecoResponse resposta(Map<Long, EntradaDeCompra> entradas) {
        EntradaDeCompra entrada = movimentoId == null ? null : entradas.get(movimentoId);
        return new HistoricoPrecoResponse(campo, valorAnterior, valorNovo, embalagemRotulo, usuarioNome, alteradoEm,
                origem, EntradaResponse.deOuNulo(entrada));
    }
}
