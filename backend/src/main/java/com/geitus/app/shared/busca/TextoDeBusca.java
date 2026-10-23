package com.geitus.app.shared.busca;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Normalizacao unica do texto de busca (docs/modules/produtos-listagem.md,
 * 4.1): a mesma funcao alimenta as colunas {@code busca_normalizada} e
 * {@code nome_normalizado} do produto e trata o termo digitado, entao "Açúcar",
 * "acucar" e "ACUCAR" se encontram.
 *
 * <p>A V10 tem o equivalente em SQL para preencher os produtos existentes; o
 * {@code MigracaoV10IT} prova que os dois dao o mesmo resultado.
 */
public final class TextoDeBusca {

    /** Quantas palavras do termo entram na busca; as demais sao ignoradas. */
    public static final int MAXIMO_DE_PALAVRAS = 5;

    private static final String ESPACO = " ";
    /** Marcas combinantes (acentos, cedilha, til) que sobram da decomposicao NFD. */
    private static final Pattern MARCAS = Pattern.compile("\\p{M}+");
    /** Espacos ASCII e separadores Unicode (U+00A0, U+2007, U+202F, U+3000...). */
    private static final Pattern ESPACOS = Pattern.compile("[\\s\\p{Z}]+");

    private TextoDeBusca() {
    }

    /**
     * Decompoe os acentos (NFD) e remove as marcas, converte para minusculas
     * ({@link Locale#ROOT}), troca qualquer sequencia de espacos por um espaco
     * so e apara as pontas. Nulo ou vazio resulta em {@code ""}.
     */
    public static String normalizar(String texto) {
        if (texto == null) {
            return "";
        }
        String semAcentos = MARCAS.matcher(Normalizer.normalize(texto, Normalizer.Form.NFD)).replaceAll("");
        return ESPACOS.matcher(semAcentos.toLowerCase(Locale.ROOT)).replaceAll(ESPACO).strip();
    }

    /** Texto pesquisavel do produto: nome, nome curto, SKU e marca informados, juntos e normalizados. */
    public static String textoDoProduto(String nome, String nomeCurto, String sku, String marca) {
        return Stream.of(nome, nomeCurto, sku, marca)
                .map(TextoDeBusca::normalizar)
                .filter(campo -> !campo.isEmpty())
                .collect(Collectors.joining(ESPACO));
    }

    /**
     * Ate {@value #MAXIMO_DE_PALAVRAS} palavras normalizadas do termo, na ordem
     * digitada. Termo nulo ou so com espacos resulta em lista vazia.
     */
    public static List<String> palavras(String termo) {
        String normalizado = normalizar(termo);
        if (normalizado.isEmpty()) {
            return List.of();
        }
        return Arrays.stream(normalizado.split(ESPACO))
                .limit(MAXIMO_DE_PALAVRAS)
                .toList();
    }
}
