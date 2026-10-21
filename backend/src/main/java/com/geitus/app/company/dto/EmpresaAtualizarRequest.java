package com.geitus.app.company.dto;

import com.geitus.app.shared.validation.Cnpj;
import com.geitus.app.shared.validation.Telefone;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Dados de entrada para atualizar o cadastro da empresa do usuario autenticado.
 *
 * <p>Nao inclui {@code id}, {@code ativo} nem timestamps: a empresa e sempre a do
 * usuario autenticado (DEC-016) e esses campos nao sao editaveis por aqui.
 *
 * <p>O fluxo "Ja possui CNPJ?" define {@code tipoPessoa} (nao -> FISICA,
 * sim -> JURIDICA). A coerencia PJ/PF (JURIDICA exige {@code cnpj} + {@code razaoSocial};
 * FISICA nao pode ter {@code cnpj}) e verificada pela anotacao de classe
 * {@link PessoaCoerente} e revalidada no {@code EmpresaService} (defesa em
 * profundidade). {@code complemento} e {@code inscricaoEstadual} sao opcionais.
 */
@PessoaCoerente
@Schema(description = "Dados para atualizar o cadastro da empresa")
public record EmpresaAtualizarRequest(

        @Schema(example = "Mercado do Zé")
        @NotBlank(message = "Nome da empresa é obrigatório.")
        @Size(max = 150, message = "Nome da empresa deve ter no máximo 150 caracteres.")
        String nome,

        @Schema(example = "(11) 3322-4455")
        @NotBlank(message = "Telefone da empresa é obrigatório.")
        @Telefone
        String telefone,

        @Schema(example = "contato@mercadodoze.com")
        @NotBlank(message = "E-mail da empresa é obrigatório.")
        @Email(message = "E-mail da empresa inválido.")
        @Size(max = 180, message = "E-mail da empresa deve ter no máximo 180 caracteres.")
        String email,

        @Schema(example = "JURIDICA", allowableValues = {"FISICA", "JURIDICA"})
        @NotBlank(message = "Tipo de pessoa é obrigatório.")
        @Pattern(regexp = "FISICA|JURIDICA", message = "Tipo de pessoa inválido: use FISICA ou JURIDICA.")
        String tipoPessoa,

        @Schema(example = "11.222.333/0001-81", description = "Obrigatório quando JURIDICA; ausente quando FISICA.")
        @Cnpj
        String cnpj,

        @Schema(example = "Mercado do Zé LTDA", description = "Obrigatório quando JURIDICA.")
        @Size(max = 180, message = "Razão social deve ter no máximo 180 caracteres.")
        String razaoSocial,

        @Schema(example = "1234567890", description = "Opcional.")
        @Size(max = 20, message = "Inscrição estadual deve ter no máximo 20 caracteres.")
        String inscricaoEstadual,

        @Schema(description = "Dados do representante legal")
        @NotNull(message = "Representante legal é obrigatório.")
        @Valid
        RepresentanteLegalRequest representanteLegal,

        @Schema(description = "Endereço da empresa")
        @NotNull(message = "Endereço é obrigatório.")
        @Valid
        EnderecoRequest endereco) {
}
