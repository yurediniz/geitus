package com.geitus.app.customer;

/**
 * Dados cadastrais de um cliente como chegam da API, ainda crus (com mascara,
 * espacos e strings vazias). A normalizacao e a validacao ficam no
 * {@link ClienteService}.
 *
 * <p>{@code telefoneEWhatsapp == null} significa {@code true} (padrao da spec:
 * o telefone principal e WhatsApp).
 */
public record DadosCliente(String nome, String cpf, String telefone, Boolean telefoneEWhatsapp,
        String whatsapp, String observacoes) {
}
