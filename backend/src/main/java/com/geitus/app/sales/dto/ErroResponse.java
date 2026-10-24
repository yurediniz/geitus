package com.geitus.app.sales.dto;

import com.geitus.app.sales.carrinho.ErroDoCalculo;

import io.swagger.v3.oas.annotations.media.Schema;

/** Regra violada (ou aviso) no calculo, com o campo do carrinho ({@code itens[0].desconto}, {@code pagamentos}). */
@Schema(description = "Erro ou aviso por campo")
public record ErroResponse(String campo, String mensagem) {

    static ErroResponse de(ErroDoCalculo erro) {
        return new ErroResponse(erro.campo(), erro.mensagem());
    }
}
