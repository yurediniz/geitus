package com.geitus.app.company;

import java.util.Locale;

/**
 * Natureza da empresa quanto a possuir ou nao CNPJ (fluxo "Ja possui CNPJ?").
 *
 * <ul>
 *   <li>{@link #FISICA}: negocio informal/autonomo, sem CNPJ; a identidade
 *       fiscal e o CPF do representante legal.</li>
 *   <li>{@link #JURIDICA}: negocio formal, com CNPJ e razao social.</li>
 * </ul>
 *
 * <p>O valor e validado na aplicacao (aqui) e no banco (constraint
 * {@code ck_empresa_tipo_pessoa} da migration V3). A coluna
 * {@code empresa.tipo_pessoa} permanece {@code VARCHAR} armazenando o nome
 * canonico do enum em maiusculas.
 */
public enum TipoPessoa {

    FISICA,
    JURIDICA;

    /**
     * Converte um texto para o tipo correspondente, aceitando espacos ao redor
     * e qualquer caixa (o valor canonico e sempre em maiusculas).
     *
     * @throws IllegalArgumentException se o valor for nulo, em branco ou nao
     *         pertencer a allow-list.
     */
    public static TipoPessoa fromString(String valor) {
        if (valor == null || valor.isBlank()) {
            throw new IllegalArgumentException("Tipo de pessoa é obrigatório.");
        }
        String normalizado = valor.trim().toUpperCase(Locale.ROOT);
        try {
            return TipoPessoa.valueOf(normalizado);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Tipo de pessoa inválido: use FISICA ou JURIDICA.");
        }
    }
}
