package com.geitus.app.supplier.dto;

import java.util.List;
import java.util.UUID;

import com.geitus.app.supplier.TipoPessoaFornecedor;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Dados de entrada para cadastrar ou atualizar um fornecedor
 * (docs/modules/fornecedores-e-marcas.md, 4.1 e 4.7).
 *
 * <p>Sem {@code empresaId}, {@code numero} nem {@code ativo}: a empresa vem do
 * JWT (DEC-016), o numero e gerado e o status muda so por inativar/reativar.
 * So a razao social/nome e obrigatoria; as regras que dependem do tipo de
 * pessoa (documento, inscricao estadual) e as mensagens de 4.6 ficam no
 * service, com o campo do erro. Documento, CEP e telefones aceitam mascara.
 *
 * <p>{@code representantes} e {@code marcaIds} sao listas completas: no
 * PATCH, ausente ou {@code null} mantem a lista atual; {@code []} remove todos.
 */
@Schema(description = "Dados para cadastro ou atualizacao de um fornecedor")
public record FornecedorRequest(

        @Schema(description = "PJ ou PF; ausente = PJ", example = "PJ")
        TipoPessoaFornecedor tipoPessoa,

        @Schema(description = "CNPJ (PJ) ou CPF (PF), com ou sem mascara", example = "11.222.333/0001-81")
        @Size(max = 20, message = "O documento deve ter no máximo 20 caracteres.")
        String documento,

        @Schema(description = "Razao social (PJ) ou nome (PF), obrigatorio", example = "Distribuidora Central Ltda")
        @Size(max = 180, message = "A razão social deve ter no máximo 180 caracteres.")
        String razaoSocial,

        @Schema(example = "Distribuidora Central")
        @Size(max = 180, message = "O nome fantasia deve ter no máximo 180 caracteres.")
        String nomeFantasia,

        @Schema(description = "So digitos ou ISENTO; so no PJ", example = "110042490114")
        @Size(max = 20, message = "A inscrição estadual deve ter no máximo 20 caracteres.")
        String inscricaoEstadual,

        @Schema(example = "01001-000")
        @Size(max = 10, message = "O CEP deve ter 8 dígitos.")
        String cep,

        @Size(max = 180, message = "O logradouro deve ter no máximo 180 caracteres.")
        String logradouro,

        @Schema(description = "Numero do endereco", example = "100")
        @Size(max = 20, message = "O número do endereço deve ter no máximo 20 caracteres.")
        String numeroEndereco,

        @Size(max = 120, message = "O complemento deve ter no máximo 120 caracteres.")
        String complemento,

        @Size(max = 120, message = "O bairro deve ter no máximo 120 caracteres.")
        String bairro,

        @Size(max = 120, message = "O município deve ter no máximo 120 caracteres.")
        String municipio,

        @Schema(example = "SP")
        @Size(max = 2, message = "UF inválida.")
        String uf,

        @Schema(example = "(11) 3322-4455")
        @Size(max = 20, message = "O telefone deve ter no máximo 20 caracteres.")
        String telefone,

        @Schema(example = "compras@distribuidora.com.br")
        @Size(max = 180, message = "O e-mail deve ter no máximo 180 caracteres.")
        String email,

        @Size(max = 500, message = "As observações devem ter no máximo 500 caracteres.")
        String observacoes,

        @Schema(description = "Lista completa, na ordem (ate 10); no PATCH, ausente mantem a atual")
        @Size(max = 10, message = "Informe no máximo 10 representantes.")
        List<@NotNull(message = "Informe o representante.") @Valid RepresentanteRequest> representantes,

        @Schema(description = "UUIDs das marcas que vende (ate 200); no PATCH, ausente mantem a lista atual")
        @Size(max = 200, message = "Informe no máximo 200 marcas.")
        List<@NotNull(message = "Informe a marca.") UUID> marcaIds) {
}
