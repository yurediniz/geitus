package com.geitus.app.iam;

import java.util.Locale;

/**
 * Allow-list de perfis de acesso do Geitus (RBAC basico).
 *
 * <ul>
 *   <li>{@link #ADMIN}: gerencia usuarios e usa o sistema.</li>
 *   <li>{@link #OPERADOR}: usa o sistema; nao gerencia usuarios.</li>
 * </ul>
 *
 * <p>O perfil e validado na aplicacao (aqui) e no banco (constraint
 * {@code ck_usuario_perfil} da migration V2). A coluna {@code usuario.perfil}
 * permanece {@code VARCHAR} armazenando o nome canonico do enum em maiusculas.
 */
public enum Perfil {

    ADMIN,
    OPERADOR;

    /**
     * Converte um texto para o perfil correspondente, aceitando espacos ao redor
     * e qualquer caixa (o valor canonico e sempre em maiusculas).
     *
     * @throws IllegalArgumentException se o valor for nulo, em branco ou nao
     *         pertencer a allow-list.
     */
    public static Perfil fromString(String valor) {
        if (valor == null || valor.isBlank()) {
            throw new IllegalArgumentException("Perfil é obrigatório.");
        }
        String normalizado = valor.trim().toUpperCase(Locale.ROOT);
        try {
            return Perfil.valueOf(normalizado);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Perfil inválido: use ADMIN ou OPERADOR.");
        }
    }
}
