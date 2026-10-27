package com.geitus.app.customer.dto;

import java.time.LocalDateTime;
import java.util.UUID;

import com.geitus.app.customer.Cliente;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica de um {@link Cliente} (docs/modules/clientes.md).
 *
 * <p>O {@code id} e o UUID publico (DEC-019/029); a PK numerica e o
 * {@code empresaId} nunca saem na API, e a entidade JPA nao e exposta.
 * {@code whatsapp} e o numero resolvido: o proprio telefone quando
 * {@code telefoneEWhatsapp}, senao o WhatsApp proprio. {@code numero} e o
 * numero de registro na empresa (Fase B2), imutavel.
 */
@Schema(description = "Dados publicos de um cliente")
public record ClienteResponse(
        @Schema(description = "Identificador publico (UUID)")
        UUID id,
        @Schema(description = "Numero de registro do cliente na empresa (1, 2, 3...), gerado na criacao e imutavel",
                example = "12")
        Long numero,
        String nome,
        String cpf,
        String telefone,
        boolean telefoneEWhatsapp,
        @Schema(description = "WhatsApp resolvido: o telefone quando telefoneEWhatsapp, senao o numero proprio")
        String whatsapp,
        String observacoes,
        boolean ativo,
        LocalDateTime criadoEm,
        LocalDateTime atualizadoEm) {

    public static ClienteResponse de(Cliente cliente) {
        return new ClienteResponse(
                cliente.getUuid(),
                cliente.getNumero(),
                cliente.getNome(),
                cliente.getCpf(),
                cliente.getTelefone(),
                cliente.isTelefoneEWhatsapp(),
                cliente.getWhatsappResolvido(),
                cliente.getObservacoes(),
                cliente.isAtivo(),
                cliente.getCriadoEm(),
                cliente.getAtualizadoEm());
    }
}
