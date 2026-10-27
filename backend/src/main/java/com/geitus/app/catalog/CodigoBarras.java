package com.geitus.app.catalog;

import java.util.regex.Pattern;

import com.geitus.app.shared.busca.TextoDeBusca;

/**
 * Regra pura do codigo de barras (docs/modules/produtos.md),
 * sem dependencia de banco ou Spring.
 *
 * <p>Codigo so com digitos e tamanho 8, 12 ou 13 e candidato GS1
 * (EAN-8, UPC-A, EAN-13) e precisa de digito verificador mod 10 valido para
 * receber esse formato; qualquer outro conteudo e {@link FormatoCodigoBarras#OUTRO}.
 * A mesma regra existe no frontend ({@code lib/codigoBarras.ts}) e na V7 (SQL).
 */
public final class CodigoBarras {

    private static final Pattern SO_DIGITOS = Pattern.compile("[0-9]+");

    private static final int TAMANHO_EAN8 = 8;
    private static final int TAMANHO_UPCA = 12;
    private static final int TAMANHO_EAN13 = 13;
    private static final int PESO_POSICAO_PAR = 3;
    private static final int PESO_POSICAO_IMPAR = 1;
    private static final int MODULO = 10;

    private CodigoBarras() {
    }

    /**
     * Remove todo espaco em branco Unicode (inclusive interno, tab, quebra de
     * linha e espaco nao separavel — a mesma classe da busca,
     * {@link TextoDeBusca#ESPACOS_EM_BRANCO}); {@code null}, vazio ou so
     * espacos viram {@code null}.
     */
    public static String normalizar(String codigo) {
        if (codigo == null) {
            return null;
        }
        String semEspacos = TextoDeBusca.ESPACOS_EM_BRANCO.matcher(codigo).replaceAll("");
        return semEspacos.isEmpty() ? null : semEspacos;
    }

    /** {@code true} se o codigo (ja normalizado) so tem digitos e tamanho 8, 12 ou 13. */
    public static boolean ehCandidatoGs1(String normalizado) {
        return soDigitos(normalizado) && tamanhoGs1(normalizado.length());
    }

    /**
     * Digito verificador GS1 mod 10: numerando da direita para a esquerda a
     * partir do verificador (posicao 1), as posicoes pares pesam 3 e as impares
     * 1; o codigo e valido quando a soma ponderada de todos os digitos e
     * multipla de 10. Texto que nao e so digitos e invalido.
     */
    public static boolean digitoVerificadorValido(String digitos) {
        if (!soDigitos(digitos)) {
            return false;
        }
        int soma = 0;
        for (int posicaoDaDireita = 1; posicaoDaDireita <= digitos.length(); posicaoDaDireita++) {
            int digito = digitos.charAt(digitos.length() - posicaoDaDireita) - '0';
            soma += digito * (posicaoDaDireita % 2 == 0 ? PESO_POSICAO_PAR : PESO_POSICAO_IMPAR);
        }
        return soma % MODULO == 0;
    }

    /** Formato pelo conteudo: candidato GS1 com digito valido recebe o formato do tamanho; o resto e OUTRO. */
    public static FormatoCodigoBarras detectarFormato(String normalizado) {
        if (!ehCandidatoGs1(normalizado) || !digitoVerificadorValido(normalizado)) {
            return FormatoCodigoBarras.OUTRO;
        }
        return switch (normalizado.length()) {
            case TAMANHO_EAN8 -> FormatoCodigoBarras.EAN8;
            case TAMANHO_UPCA -> FormatoCodigoBarras.UPCA;
            default -> FormatoCodigoBarras.EAN13;
        };
    }

    private static boolean soDigitos(String texto) {
        return texto != null && SO_DIGITOS.matcher(texto).matches();
    }

    private static boolean tamanhoGs1(int tamanho) {
        return tamanho == TAMANHO_EAN8 || tamanho == TAMANHO_UPCA || tamanho == TAMANHO_EAN13;
    }
}
