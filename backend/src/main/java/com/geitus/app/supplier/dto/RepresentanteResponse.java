package com.geitus.app.supplier.dto;

import java.util.UUID;

import com.geitus.app.supplier.RepresentanteDeVenda;

import io.swagger.v3.oas.annotations.media.Schema;

/** Representante de venda na resposta do fornecedor; telefone so com digitos. */
@Schema(description = "Representante de venda do fornecedor")
public record RepresentanteResponse(UUID id, String nome, String telefone, String email) {

    public static RepresentanteResponse de(RepresentanteDeVenda representante) {
        return new RepresentanteResponse(representante.getUuid(), representante.getNome(),
                representante.getTelefone(), representante.getEmail());
    }
}
