package com.geitus.app.inventory.dto;

import java.math.BigDecimal;

import com.geitus.app.catalog.listagem.ResumoDaPosicao;

/**
 * Resumo da posicao de estoque (spec de Estoque, regra 24), sem o filtro de
 * situacao. As contagens por situacao sao exclusivas; os regulares ficam fora.
 */
public record ResumoDaPosicaoResponse(long produtos, long negativos, long zerados, long baixo, long reposicao,
        long alto, BigDecimal valorTotalEmCusto, long semCusto) {

    public static ResumoDaPosicaoResponse de(ResumoDaPosicao resumo) {
        return new ResumoDaPosicaoResponse(resumo.produtos(), resumo.negativos(), resumo.zerados(), resumo.baixo(),
                resumo.reposicao(), resumo.alto(), resumo.valorTotalEmCusto(), resumo.semCusto());
    }
}
