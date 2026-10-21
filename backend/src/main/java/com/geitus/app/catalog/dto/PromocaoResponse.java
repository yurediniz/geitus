package com.geitus.app.catalog.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.SituacaoPromocao;

import io.swagger.v3.oas.annotations.media.Schema;

/** Promocao do produto com a situacao calculada para a data de hoje (nao e coluna). */
@Schema(description = "Promocao do produto e a situacao na data de hoje (fuso America/Sao_Paulo)")
public record PromocaoResponse(
        BigDecimal preco,
        LocalDate inicio,
        LocalDate fim,
        @Schema(description = "AGENDADA, VIGENTE ou ENCERRADA")
        SituacaoPromocao situacao) {

    /** Promocao do produto, ou {@code null} se ele nao tiver promocao. */
    static PromocaoResponse deOuNulo(Produto produto, LocalDate hoje) {
        if (produto.getPrecoPromocional() == null) {
            return null;
        }
        return new PromocaoResponse(produto.getPrecoPromocional(), produto.getPromocaoInicio(),
                produto.getPromocaoFim(),
                SituacaoPromocao.de(produto.getPromocaoInicio(), produto.getPromocaoFim(), hoje));
    }

    boolean vigente() {
        return situacao == SituacaoPromocao.VIGENTE;
    }
}
