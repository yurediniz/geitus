package com.geitus.app.supplier.dto;

import java.util.UUID;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;

/**
 * Um representante de venda da lista do request (docs/modules/fornecedores-e-marcas.md,
 * 4.2): {@code id} presente mantem o representante, ausente cria. Nome
 * obrigatorio (conferido no service, com o campo indexado); telefone e e-mail
 * opcionais.
 */
@Schema(description = "Representante de venda do fornecedor")
public record RepresentanteRequest(
        @Schema(description = "UUID do representante ja cadastrado; ausente = novo")
        UUID id,

        @Schema(example = "Ana Souza")
        @Size(max = 120, message = "O nome do representante deve ter no máximo 120 caracteres.")
        String nome,

        @Schema(example = "(11) 98765-4321")
        @Size(max = 20, message = "O telefone deve ter no máximo 20 caracteres.")
        String telefone,

        @Schema(example = "ana@distribuidora.com.br")
        @Size(max = 180, message = "O e-mail deve ter no máximo 180 caracteres.")
        String email) {
}
