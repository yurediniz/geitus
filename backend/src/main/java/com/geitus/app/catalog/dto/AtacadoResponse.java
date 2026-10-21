package com.geitus.app.catalog.dto;

import java.math.BigDecimal;

import com.geitus.app.catalog.Produto;

import io.swagger.v3.oas.annotations.media.Schema;

/** Preco de atacado do produto e a quantidade minima (na unidade de venda). */
@Schema(description = "Preco de atacado a partir de uma quantidade minima")
public record AtacadoResponse(BigDecimal preco, BigDecimal quantidadeMinima) {

    /** Atacado do produto, ou {@code null} se ele nao tiver atacado. */
    static AtacadoResponse deOuNulo(Produto produto) {
        if (produto.getPrecoAtacado() == null) {
            return null;
        }
        return new AtacadoResponse(produto.getPrecoAtacado(), produto.getQuantidadeMinimaAtacado());
    }
}
