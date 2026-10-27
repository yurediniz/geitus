package com.geitus.app.customer.dto;

import com.geitus.app.customer.DadosCliente;
import com.geitus.app.shared.validation.Cpf;
import com.geitus.app.shared.validation.Telefone;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Dados de entrada para cadastro ou atualizacao de um cliente
 * (docs/modules/clientes.md).
 *
 * <p>Nao inclui {@code empresaId} nem {@code ativo}: a empresa e sempre
 * derivada do usuario autenticado (DEC-016) e o status so muda pelos endpoints
 * de inativar/reativar. CPF, telefone e WhatsApp aceitam mascara; a
 * normalizacao (so digitos, vazio como {@code null}) e a revalidacao ficam no
 * {@code ClienteService}. {@code telefoneEWhatsapp} ausente significa
 * {@code true}.
 *
 * <p>O {@code whatsapp} e validado no nivel da classe ({@link WhatsappCoerente}):
 * so importa quando {@code telefoneEWhatsapp = false}; caso contrario e
 * descartado sem validar (docs/modules/clientes.md).
 */
@Schema(description = "Dados para cadastro ou atualizacao de um cliente")
@WhatsappCoerente
public record ClienteRequest(

        @Schema(example = "Ana Souza")
        @NotBlank(message = "Nome do cliente é obrigatório.")
        @Size(max = 150, message = "Nome deve ter no máximo 150 caracteres.")
        String nome,

        @Schema(example = "111.444.777-35")
        @Cpf
        @Size(max = 20, message = "CPF deve ter no máximo 20 caracteres.")
        String cpf,

        @Schema(example = "(11) 98765-4321")
        @Telefone
        @Size(max = 20, message = "Telefone deve ter no máximo 20 caracteres.")
        String telefone,

        @Schema(description = "O telefone principal e WhatsApp (padrao: true)", example = "true")
        Boolean telefoneEWhatsapp,

        @Schema(description = "WhatsApp, apenas quando diferente do telefone", example = "(11) 91234-5678")
        @Size(max = 20, message = "WhatsApp deve ter no máximo 20 caracteres.")
        String whatsapp,

        @Schema(example = "Prefere contato a tarde.")
        @Size(max = 500, message = "Observações devem ter no máximo 500 caracteres.")
        String observacoes) {

    /** Converte para a entrada crua do service (sem normalizar). */
    public DadosCliente paraDados() {
        return new DadosCliente(nome, cpf, telefone, telefoneEWhatsapp, whatsapp, observacoes);
    }
}
