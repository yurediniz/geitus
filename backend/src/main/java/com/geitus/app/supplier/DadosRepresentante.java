package com.geitus.app.supplier;

import java.util.UUID;

/**
 * Um representante da lista do request, ja normalizado (docs/modules/fornecedores-e-marcas.md,
 * 4.2): {@code id} presente mantem o representante, ausente cria um novo.
 */
public record DadosRepresentante(UUID id, String nome, String telefone, String email) {
}
