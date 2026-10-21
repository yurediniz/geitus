package com.geitus.app.company.dto;

import com.geitus.app.shared.validation.Cpf;
import com.geitus.app.shared.validation.Telefone;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Dados de entrada do representante legal (sempre obrigatorio).
 *
 * <p>Todos os campos sao obrigatorios. CPF e telefone aceitam mascara na entrada
 * (os separadores sao ignorados) e sao normalizados para somente digitos no
 * {@code EmpresaService}. Os tamanhos maximos espelham as colunas
 * {@code representante_*} da migration V3.
 */
@Schema(description = "Dados do representante legal da empresa")
public record RepresentanteLegalRequest(

        @Schema(example = "Maria da Silva")
        @NotBlank(message = "Nome do representante é obrigatório.")
        @Size(max = 180, message = "Nome do representante deve ter no máximo 180 caracteres.")
        String nome,

        @Schema(example = "111.444.777-35")
        @NotBlank(message = "CPF do representante é obrigatório.")
        @Cpf
        String cpf,

        @Schema(example = "(11) 98765-4321")
        @NotBlank(message = "Telefone do representante é obrigatório.")
        @Telefone
        String telefone,

        @Schema(example = "maria@empresa.com")
        @NotBlank(message = "E-mail do representante é obrigatório.")
        @Email(message = "E-mail do representante inválido.")
        @Size(max = 180, message = "E-mail do representante deve ter no máximo 180 caracteres.")
        String email) {
}
