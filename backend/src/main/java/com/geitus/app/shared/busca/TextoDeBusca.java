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
 * {@code MigracaoV10IT} prova que os dois dao o mesmo resultado para as 53
 * letras acentuadas do {@code translate} da V10 (letras fora dela, como "Ÿ",
 * nao tem equivalencia garantida) e para os caracteres de controle e de
 * formatacao do plano basico do Unicode.
 *
 * <p><b>Mudar esta normalizacao exige recalcular</b> {@code busca_normalizada}
 * e {@code nome_normalizado} de todos os produtos (migration nova ou rotina de
 * recalculo): as colunas gravadas e o termo digitado precisam passar pela
 * mesma regra, senao a busca e a ordem por nome deixam de casar.
 */
public final class TextoDeBusca {

    /** Quantas palavras do termo entram na busca; as demais sao ignoradas. */
    public static final int MAXIMO_DE_PALAVRAS = 5;

    /**
     * Qualquer espaco em branco Unicode (propriedade White_Space: espaco, tab,
     * quebras de linha, U+0085, U+00A0, U+2007, U+202F, U+3000...). E a mesma
     * classe do {@code CodigoBarras.normalizar}, que a usa daqui.
     */
    public static final Pattern ESPACOS_EM_BRANCO = Pattern.compile("\\s+", Pattern.UNICODE_CHARACTER_CLASS);

    private static final String ESPACO = " ";

    /**
     * Caracteres de controle (Cc) e de formatacao (Cf) invisiveis, como U+0000,
     * U+200B, U+FEFF e U+00AD, menos os que sao espaco em branco (tab, quebras
     * de linha e U+0085 viram espaco, nao somem).
     */
    private static final Pattern INVISIVEIS =
            Pattern.compile("[\\p{Cc}\\p{Cf}&&[^\\s]]+", Pattern.UNICODE_CHARACTER_CLASS);

    /** Os invisiveis e as marcas combinantes (acentos, cedilha, til) que sobram da decomposicao NFD. */
    private static final Pattern INVISIVEIS_E_MARCAS =
            Pattern.compile("[\\p{M}\\p{Cc}\\p{Cf}&&[^\\s]]+", Pattern.UNICODE_CHARACTER_CLASS);

    private TextoDeBusca() {
    }

    /**
     * Decompoe os acentos (NFD) e remove as marcas e os caracteres invisiveis,
     * converte para minusculas ({@link Locale#ROOT}), troca qualquer sequencia
     * de espacos por um espaco so e apara as pontas. Nulo ou vazio resulta em
     * {@code ""}.
     */
    public static String normalizar(String texto) {
        if (texto == null) {
            return "";
        }
        String decomposto = Normalizer.normalize(texto, Normalizer.Form.NFD);
        String semAcentos = INVISIVEIS_E_MARCAS.matcher(decomposto).replaceAll("");
        return ESPACOS_EM_BRANCO.matcher(semAcentos.toLowerCase(Locale.ROOT)).replaceAll(ESPACO).strip();
    }

    /**
     * Termo comparado com os codigos de barras: sem nenhum espaco nem caractere
     * invisivel, com as letras como digitadas (quem compara decide a caixa).
     * Sem conteudo, {@code null}: nao ha busca por codigo.
     */
    public static String termoDeCodigo(String termo) {
        if (termo == null) {
            return null;
        }
        String semInvisiveis = INVISIVEIS.matcher(termo).replaceAll("");
        String semEspacos = ESPACOS_EM_BRANCO.matcher(semInvisiveis).replaceAll("");
        return semEspacos.isEmpty() ? null : semEspacos;
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
     * digitada. Termo nulo, so com espacos ou so com invisiveis resulta em
     * lista vazia.
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
