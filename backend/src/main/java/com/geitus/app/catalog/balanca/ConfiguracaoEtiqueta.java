package com.geitus.app.catalog.balanca;

import java.util.regex.Pattern;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Formato da etiqueta de balanca de uma empresa (docs/modules/produtos-codigo-e-balanca.md,
 * 3.1): prefixo, digitos do codigo do produto, zeros de preenchimento, o que a
 * informacao traz (valor ou peso), os digitos e as casas decimais dela e se ha
 * o digito verificador EAN-13 no fim.
 *
 * <p>Valor puro, sem banco: e o que o {@link LeitorEtiquetaBalanca} usa e o que a
 * tela de teste envia (configuracao ainda nao salva). Os limites espelham os
 * CHECKs da V11, que sao a ultima barreira.
 */
public record ConfiguracaoEtiqueta(String prefixo, int digitosCodigo, int digitosPreenchimento,
        TipoInformacaoEtiqueta tipoInformacao, int digitosInformacao, int casasDecimais, boolean digitoVerificador) {

    /** A etiqueta e um EAN-13. */
    public static final int TAMANHO_DA_ETIQUETA = 13;

    static final int MENOR_CODIGO = 4;
    static final int MAIOR_CODIGO = 6;
    static final int MENOR_PREENCHIMENTO = 0;
    static final int MAIOR_PREENCHIMENTO = 2;
    static final int MENOR_INFORMACAO = 4;
    static final int MAIOR_INFORMACAO = 7;
    static final int MENOS_CASAS = 2;
    static final int MAIS_CASAS = 3;

    static final String MENSAGEM_PREFIXO = "O prefixo deve ter 1 ou 2 dígitos.";
    static final String MENSAGEM_CODIGO = "O código deve ter de 4 a 6 dígitos.";
    static final String MENSAGEM_PREENCHIMENTO = "O preenchimento deve ter de 0 a 2 dígitos.";
    static final String MENSAGEM_TIPO = "Informe se a etiqueta traz o valor ou o peso.";
    static final String MENSAGEM_INFORMACAO = "A informação deve ter de 4 a 7 dígitos.";
    static final String MENSAGEM_CASAS = "As casas decimais devem ser 2 ou 3.";
    static final String MENSAGEM_TAMANHO_TOTAL = "A etiqueta precisa ter 13 dígitos no total (hoje: %d).";

    /** 1 ou 2 digitos ASCII (o mesmo do CHECK {@code ck_etiqueta_prefixo}). */
    private static final Pattern PREFIXO = Pattern.compile("[0-9]{1,2}");

    /** Padrao do usuario (Toledo Prix 4): 2 + codigo 6 + valor 6 com 3 casas, sem DV. */
    public static ConfiguracaoEtiqueta padrao() {
        return new ConfiguracaoEtiqueta("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false);
    }

    /** Digitos somados: prefixo + codigo + preenchimento + informacao + DV. */
    public int tamanhoTotal() {
        int tamanhoDoPrefixo = prefixo == null ? 0 : prefixo.length();
        return tamanhoDoPrefixo + digitosCodigo + digitosPreenchimento + digitosInformacao
                + (digitoVerificador ? 1 : 0);
    }

    /**
     * Valida os intervalos de cada campo (400 com o campo) e depois a soma de
     * 13 digitos (400 com a mensagem da spec). Os intervalos vem antes: com um
     * campo fora do intervalo, a soma nao diz nada util.
     */
    public void validar() {
        exigir(prefixo != null && PREFIXO.matcher(prefixo).matches(), MENSAGEM_PREFIXO, "prefixo");
        exigir(entre(digitosCodigo, MENOR_CODIGO, MAIOR_CODIGO), MENSAGEM_CODIGO, "digitosCodigo");
        exigir(entre(digitosPreenchimento, MENOR_PREENCHIMENTO, MAIOR_PREENCHIMENTO), MENSAGEM_PREENCHIMENTO,
                "digitosPreenchimento");
        exigir(tipoInformacao != null, MENSAGEM_TIPO, "tipoInformacao");
        exigir(entre(digitosInformacao, MENOR_INFORMACAO, MAIOR_INFORMACAO), MENSAGEM_INFORMACAO,
                "digitosInformacao");
        exigir(entre(casasDecimais, MENOS_CASAS, MAIS_CASAS), MENSAGEM_CASAS, "casasDecimais");
        if (tamanhoTotal() != TAMANHO_DA_ETIQUETA) {
            throw new RegraDeNegocioException(MENSAGEM_TAMANHO_TOTAL.formatted(tamanhoTotal()));
        }
    }

    private static boolean entre(int valor, int menor, int maior) {
        return valor >= menor && valor <= maior;
    }

    private static void exigir(boolean valido, String mensagem, String campo) {
        if (!valido) {
            throw new RegraDeNegocioException(mensagem, campo);
        }
    }
}
