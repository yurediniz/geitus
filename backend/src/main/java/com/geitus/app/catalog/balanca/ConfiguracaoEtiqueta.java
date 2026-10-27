package com.geitus.app.catalog.balanca;

import java.util.regex.Pattern;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Formato da etiqueta de balanca de uma empresa (docs/modules/produtos.md):
 * prefixo, digitos do codigo do produto, zeros de preenchimento, o que a
 * informacao traz (valor ou peso), os digitos e as casas decimais dela e se ha
 * o digito verificador EAN-13 no fim.
 *
 * <p>Valor puro, sem banco: e o que o {@link LeitorEtiquetaBalanca} usa e o que a
 * tela de teste envia (configuracao ainda nao salva). Duas camadas de regra:
 * <ul>
 *   <li>o construtor garante as invariantes de cada campo (prefixo de 1 ou 2
 *       digitos, intervalos, tipo informado) com {@link IllegalArgumentException}:
 *       nenhuma instancia impossivel chega ao leitor;</li>
 *   <li>{@link #validada} recebe o que veio da tela (inclusive nulos) e responde
 *       com as mensagens de usuario (400 com o campo), e {@link #validar()}
 *       confere a soma de 13 digitos.</li>
 * </ul>
 * Os limites espelham os CHECKs da V11, que sao a ultima barreira.
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
    static final String MENSAGEM_CODIGO = "O código do produto na etiqueta deve ter de 4 a 6 dígitos.";
    static final String MENSAGEM_PREENCHIMENTO = "O preenchimento deve ter de 0 a 2 dígitos.";
    static final String MENSAGEM_TIPO = "Informe se a etiqueta traz o valor ou o peso.";
    static final String MENSAGEM_INFORMACAO = "O valor ou o peso deve ter de 4 a 7 dígitos.";
    static final String MENSAGEM_CASAS = "As casas decimais devem ser 2 ou 3.";
    static final String MENSAGEM_DIGITO_VERIFICADOR = "Informe se a etiqueta tem dígito verificador.";
    static final String MENSAGEM_TAMANHO_TOTAL = "A etiqueta precisa ter 13 dígitos no total (hoje: %d).";

    /** 1 ou 2 digitos ASCII (o mesmo do CHECK {@code ck_etiqueta_prefixo}). */
    private static final Pattern PREFIXO = Pattern.compile("[0-9]{1,2}");

    /** Invariantes de cada campo; a soma de 13 digitos fica em {@link #validar()}. */
    public ConfiguracaoEtiqueta {
        exigirInvariante(prefixoValido(prefixo), "prefixo");
        exigirInvariante(entre(digitosCodigo, MENOR_CODIGO, MAIOR_CODIGO), "digitosCodigo");
        exigirInvariante(entre(digitosPreenchimento, MENOR_PREENCHIMENTO, MAIOR_PREENCHIMENTO),
                "digitosPreenchimento");
        exigirInvariante(tipoInformacao != null, "tipoInformacao");
        exigirInvariante(entre(digitosInformacao, MENOR_INFORMACAO, MAIOR_INFORMACAO), "digitosInformacao");
        exigirInvariante(entre(casasDecimais, MENOS_CASAS, MAIS_CASAS), "casasDecimais");
    }

    /** Padrao do usuario (Toledo Prix 4): 2 + codigo 6 + valor 6 com 3 casas, sem DV. */
    public static ConfiguracaoEtiqueta padrao() {
        return new ConfiguracaoEtiqueta("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false);
    }

    /**
     * Configuracao a partir do que veio da tela, ja validada: cada campo ausente
     * ou fora do intervalo e um 400 com o campo e a mensagem de usuario (nada e
     * desembrulhado sem checar), e depois a soma de 13 digitos ({@link #validar()}).
     * Os intervalos vem antes da soma: com um campo fora, a soma nao diz nada util.
     */
    public static ConfiguracaoEtiqueta validada(String prefixo, Integer digitosCodigo, Integer digitosPreenchimento,
            TipoInformacaoEtiqueta tipoInformacao, Integer digitosInformacao, Integer casasDecimais,
            Boolean digitoVerificador) {
        exigirDaTela(prefixoValido(prefixo), MENSAGEM_PREFIXO, "prefixo");
        exigirDaTela(entre(digitosCodigo, MENOR_CODIGO, MAIOR_CODIGO), MENSAGEM_CODIGO, "digitosCodigo");
        exigirDaTela(entre(digitosPreenchimento, MENOR_PREENCHIMENTO, MAIOR_PREENCHIMENTO), MENSAGEM_PREENCHIMENTO,
                "digitosPreenchimento");
        exigirDaTela(tipoInformacao != null, MENSAGEM_TIPO, "tipoInformacao");
        exigirDaTela(entre(digitosInformacao, MENOR_INFORMACAO, MAIOR_INFORMACAO), MENSAGEM_INFORMACAO,
                "digitosInformacao");
        exigirDaTela(entre(casasDecimais, MENOS_CASAS, MAIS_CASAS), MENSAGEM_CASAS, "casasDecimais");
        exigirDaTela(digitoVerificador != null, MENSAGEM_DIGITO_VERIFICADOR, "digitoVerificador");
        ConfiguracaoEtiqueta configuracao = new ConfiguracaoEtiqueta(prefixo, digitosCodigo, digitosPreenchimento,
                tipoInformacao, digitosInformacao, casasDecimais, digitoVerificador);
        configuracao.validar();
        return configuracao;
    }

    /** Digitos somados: prefixo + codigo + preenchimento + informacao + DV. */
    public int tamanhoTotal() {
        return prefixo.length() + digitosCodigo + digitosPreenchimento + digitosInformacao
                + (digitoVerificador ? 1 : 0);
    }

    /** A soma precisa dar 13 (400 com a mensagem da spec); os campos ja sao validos pelo construtor. */
    public void validar() {
        if (tamanhoTotal() != TAMANHO_DA_ETIQUETA) {
            throw new RegraDeNegocioException(MENSAGEM_TAMANHO_TOTAL.formatted(tamanhoTotal()));
        }
    }

    /** Formato compacto para o rastro em log: "2|codigo 6|preenchimento 0|VALOR 6|casas 3|sem DV". */
    public String descricaoCompacta() {
        return String.join("|", prefixo, "codigo " + digitosCodigo, "preenchimento " + digitosPreenchimento,
                tipoInformacao + " " + digitosInformacao, "casas " + casasDecimais,
                digitoVerificador ? "com DV" : "sem DV");
    }

    private static boolean prefixoValido(String prefixo) {
        return prefixo != null && PREFIXO.matcher(prefixo).matches();
    }

    private static boolean entre(Integer valor, int menor, int maior) {
        return valor != null && valor >= menor && valor <= maior;
    }

    private static void exigirInvariante(boolean valido, String campo) {
        if (!valido) {
            throw new IllegalArgumentException("Configuracao de etiqueta com " + campo + " invalido.");
        }
    }

    private static void exigirDaTela(boolean valido, String mensagem, String campo) {
        if (!valido) {
            throw new RegraDeNegocioException(mensagem, campo);
        }
    }
}
