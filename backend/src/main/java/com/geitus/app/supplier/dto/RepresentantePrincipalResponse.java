package com.geitus.app.supplier.dto;

import com.geitus.app.supplier.RepresentanteDeVenda;

import io.swagger.v3.oas.annotations.media.Schema;

/** O primeiro representante da lista, mostrado na listagem de fornecedores (spec de Fornecedores e marcas). */
@Schema(description = "Primeiro representante do fornecedor")
public record RepresentantePrincipalResponse(String nome, String telefone) {

    public static RepresentantePrincipalResponse de(RepresentanteDeVenda representante) {
        return new RepresentantePrincipalResponse(representante.getNome(), representante.getTelefone());
    }
}
