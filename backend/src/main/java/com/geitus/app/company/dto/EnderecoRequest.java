package com.geitus.app.company.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Dados de entrada do endereco da empresa.
 *
 * <p>Todos os campos sao obrigatorios, exceto {@code complemento}. O CEP aceita
 * mascara na entrada e e normalizado para 8 digitos no {@code EmpresaService}. O
 * {@code numero} aceita um valor numerico ou {@code "S/N"} (sem numero). A UF e
 * validada contra a lista das 27 unidades federativas.
 */
@Schema(description = "Endereço da empresa")
public record EnderecoRequest(

        @Schema(example = "01001-000")
        @NotBlank(message = "CEP é obrigatório.")
        @Pattern(regexp = "\\d{5}-?\\d{3}", message = "CEP deve ter 8 dígitos.")
        String cep,

        @Schema(example = "Praça da Sé")
        @NotBlank(message = "Logradouro é obrigatório.")
        @Size(max = 180, message = "Logradouro deve ter no máximo 180 caracteres.")
        String logradouro,

        @Schema(example = "100")
        @NotBlank(message = "Número é obrigatório (use \"S/N\" quando não houver).")
        @Size(max = 20, message = "Número deve ter no máximo 20 caracteres.")
        @Pattern(regexp = "\\d+|(?i:s/n)", message = "Número deve conter apenas dígitos ou \"S/N\".")
        String numero,

        @Schema(example = "Sala 2")
        @Size(max = 120, message = "Complemento deve ter no máximo 120 caracteres.")
        String complemento,

        @Schema(example = "Sé")
        @NotBlank(message = "Bairro é obrigatório.")
        @Size(max = 120, message = "Bairro deve ter no máximo 120 caracteres.")
        String bairro,

        @Schema(example = "São Paulo")
        @NotBlank(message = "Município é obrigatório.")
        @Size(max = 120, message = "Município deve ter no máximo 120 caracteres.")
        String municipio,

        @Schema(example = "SP")
        @NotBlank(message = "UF é obrigatória.")
        @Pattern(
                regexp = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO",
                message = "UF inválida.")
        String uf) {
}
