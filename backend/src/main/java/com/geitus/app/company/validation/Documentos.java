package com.geitus.app.company.validation;

/**
 * Utilitario de validacao e normalizacao de documentos brasileiros (CPF e CNPJ).
 *
 * <p>Funcoes puras (sem estado), reutilizadas tanto pelas anotacoes de Bean
 * Validation ({@code @Cpf}, {@code @Cnpj}) quanto pela revalidacao no
 * {@code EmpresaService} (defesa em profundidade). A validacao confere os
 * digitos verificadores, alem do formato.
 */
public final class Documentos {

    private Documentos() {
        // Utilitario: nao instanciavel.
    }

    /**
     * Remove tudo que nao for digito. Retorna {@code null} quando a entrada e
     * {@code null}; para uma entrada sem nenhum digito, retorna string vazia.
     */
    public static String somenteDigitos(String valor) {
        if (valor == null) {
            return null;
        }
        return valor.replaceAll("\\D", "");
    }

    /**
     * Valida um CPF pelos digitos verificadores. Aceita entrada com ou sem
     * mascara (os separadores sao ignorados). Rejeita nulo, tamanho diferente
     * de 11 e sequencias de digitos repetidos (ex.: 00000000000).
     */
    public static boolean cpfValido(String valor) {
        String digitos = somenteDigitos(valor);
        if (digitos == null || digitos.length() != 11 || todosIguais(digitos)) {
            return false;
        }
        int primeiro = digitoVerificador(digitos, 9, 10);
        int segundo = digitoVerificador(digitos, 10, 11);
        return primeiro == (digitos.charAt(9) - '0') && segundo == (digitos.charAt(10) - '0');
    }

    /**
     * Valida um CNPJ pelos digitos verificadores. Aceita entrada com ou sem
     * mascara. Rejeita nulo, tamanho diferente de 14 e sequencias repetidas.
     */
    public static boolean cnpjValido(String valor) {
        String digitos = somenteDigitos(valor);
        if (digitos == null || digitos.length() != 14 || todosIguais(digitos)) {
            return false;
        }
        int[] pesosPrimeiro = {5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};
        int[] pesosSegundo = {6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2};
        int primeiro = digitoVerificadorCnpj(digitos, pesosPrimeiro);
        int segundo = digitoVerificadorCnpj(digitos, pesosSegundo);
        return primeiro == (digitos.charAt(12) - '0') && segundo == (digitos.charAt(13) - '0');
    }

    /**
     * Calcula um digito verificador de CPF pelo modulo 11 sobre os primeiros
     * {@code quantidade} digitos, usando pesos decrescentes iniciados em
     * {@code pesoInicial}.
     */
    private static int digitoVerificador(String digitos, int quantidade, int pesoInicial) {
        int soma = 0;
        int peso = pesoInicial;
        for (int i = 0; i < quantidade; i++) {
            soma += (digitos.charAt(i) - '0') * peso;
            peso--;
        }
        int resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    }

    private static int digitoVerificadorCnpj(String digitos, int[] pesos) {
        int soma = 0;
        for (int i = 0; i < pesos.length; i++) {
            soma += (digitos.charAt(i) - '0') * pesos[i];
        }
        int resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    }

    private static boolean todosIguais(String digitos) {
        char primeiro = digitos.charAt(0);
        for (int i = 1; i < digitos.length(); i++) {
            if (digitos.charAt(i) != primeiro) {
                return false;
            }
        }
        return true;
    }
}
