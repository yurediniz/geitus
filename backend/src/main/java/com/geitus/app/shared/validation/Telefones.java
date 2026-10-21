package com.geitus.app.shared.validation;

/**
 * Utilitario de validacao e normalizacao de telefones brasileiros.
 *
 * <p>Funcao pura reutilizada pela anotacao {@code @Telefone} e pela revalidacao
 * nos services de Empresa e Clientes. Aceita numeros fixos (10 digitos) e
 * celulares (11 digitos), sempre com DDD valido (11 a 99). Numeros com mascara
 * sao aceitos: os separadores sao ignorados.
 */
public final class Telefones {

    private Telefones() {
        // Utilitario: nao instanciavel.
    }

    /**
     * Remove tudo que nao for digito. {@code null} permanece {@code null}.
     */
    public static String somenteDigitos(String valor) {
        return Documentos.somenteDigitos(valor);
    }

    /**
     * Valida um telefone BR: 10 (fixo) ou 11 (celular) digitos, com DDD entre
     * 11 e 99. Aceita entrada com ou sem mascara.
     */
    public static boolean valido(String valor) {
        String digitos = somenteDigitos(valor);
        if (digitos == null || (digitos.length() != 10 && digitos.length() != 11)) {
            return false;
        }
        int ddd = (digitos.charAt(0) - '0') * 10 + (digitos.charAt(1) - '0');
        return ddd >= 11 && ddd <= 99;
    }
}
