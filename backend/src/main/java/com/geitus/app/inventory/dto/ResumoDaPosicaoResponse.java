package com.geitus.app.inventory.dto;

import java.math.BigDecimal;

import com.geitus.app.catalog.listagem.ResumoDaPosicao;

/** Resumo da posicao de estoque (spec de Estoque, regra 24), sem o filtro de situacao. */
public record ResumoDaPosicaoResponse(long produtos, long semEstoque, long baixo, long negativos,
        BigDecimal valorTotalEmCusto, long semCusto) {

    public static ResumoDaPosicaoResponse de(ResumoDaPosicao resumo) {
        return new ResumoDaPosicaoResponse(resumo.produtos(), resumo.semEstoque(), resumo.baixo(), resumo.negativos(),
                resumo.valorTotalEmCusto(), resumo.semCusto());
    }
}
