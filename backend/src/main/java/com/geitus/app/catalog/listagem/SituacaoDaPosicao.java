package com.geitus.app.catalog.listagem;

import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Filtro de situacao da posicao de estoque (spec de Estoque, regras 16 e 23),
 * com multisselecao: as situacoes escolhidas se combinam com OU. Cada valor
 * guarda o predicado SQL FIXO, o mesmo de {@code SituacaoEstoque} em Java; as
 * seis situacoes sao exclusivas. O controle de estoque ja e exigido pela
 * propria consulta da posicao; a listagem de produtos usa os mesmos predicados
 * ({@link EstoqueFiltro}).
 */
public enum SituacaoDaPosicao {
    /** Saldo menor que zero (so a venda deixa o saldo negativo). */
    NEGATIVO("negativo", SituacaoDaPosicao.SALDO_NEGATIVO),
    /** Saldo igual a zero. */
    ZERADO("zerado", SituacaoDaPosicao.SALDO_ZERADO),
    /** Saldo positivo ate o minimo. */
    BAIXO("baixo", SituacaoDaPosicao.ESTOQUE_BAIXO),
    /** Saldo acima do minimo (ou sem minimo) e ate o ponto de reposicao. */
    REPOSICAO("reposicao", SituacaoDaPosicao.EM_REPOSICAO),
    /** Nenhuma das outras: saldo positivo, acima dos niveis informados e ate o maximo. */
    REGULAR("regular", SituacaoDaPosicao.ESTOQUE_REGULAR),
    /** Saldo acima do maximo (acima do minimo e do ponto, pela regra 15). */
    ALTO("alto", SituacaoDaPosicao.ESTOQUE_ALTO);

    static final String MENSAGEM_INVALIDA = "Situação de estoque inválida.";
    static final String CAMPO = "situacao";

    // Condicoes compartilhadas com o EstoqueFiltro da listagem de produtos e com o resumo: nao divergem.
    // Cada uma espelha um passo de SituacaoEstoque.de (a primeira que vale): as seguintes excluem as anteriores.
    private static final String SALDO = "COALESCE(s.saldo, 0)";
    static final String SALDO_NEGATIVO = SALDO + " < 0";
    static final String SALDO_ZERADO = SALDO + " = 0";
    static final String ESTOQUE_BAIXO = "(" + SALDO + " > 0 AND " + SALDO + " <= p.estoque_minimo)";
    static final String EM_REPOSICAO = "(" + SALDO + " > 0"
            + " AND (p.estoque_minimo IS NULL OR " + SALDO + " > p.estoque_minimo)"
            + " AND " + SALDO + " <= p.ponto_reposicao)";
    static final String ESTOQUE_ALTO = "(" + SALDO + " > 0"
            + " AND (p.estoque_minimo IS NULL OR " + SALDO + " > p.estoque_minimo)"
            + " AND (p.ponto_reposicao IS NULL OR " + SALDO + " > p.ponto_reposicao)"
            + " AND " + SALDO + " > p.estoque_maximo)";
    static final String ESTOQUE_REGULAR = "(" + SALDO + " > 0"
            + " AND (p.estoque_minimo IS NULL OR " + SALDO + " > p.estoque_minimo)"
            + " AND (p.ponto_reposicao IS NULL OR " + SALDO + " > p.ponto_reposicao)"
            + " AND (p.estoque_maximo IS NULL OR " + SALDO + " <= p.estoque_maximo))";

    private final String nomeNaApi;
    private final String predicado;

    SituacaoDaPosicao(String nomeNaApi, String predicado) {
        this.nomeNaApi = nomeNaApi;
        this.predicado = predicado;
    }

    /** Valor aceito no parametro da API (a allow-list; tambem anunciado na OpenAPI). */
    public String nomeNaApi() {
        return nomeNaApi;
    }

    /**
     * Valores do parametro {@code situacao} (repetido ou separado por virgula):
     * ausente, vazio ou so com espacos e o conjunto vazio (sem filtro);
     * repetidos contam uma vez; qualquer valor desconhecido, 400.
     */
    public static Set<SituacaoDaPosicao> doParametro(List<String> valores) {
        return escolherTodos(values(), SituacaoDaPosicao.class, SituacaoDaPosicao::nomeNaApi, valores,
                MENSAGEM_INVALIDA, CAMPO);
    }

    /** {@code AND (p1 OR p2 ...)} das situacoes escolhidas, na ordem do enum; vazio e sem filtro ({@code ""}). */
    static String condicao(Set<SituacaoDaPosicao> situacoes) {
        return situacoes.isEmpty() ? "" : " AND " + emOu(situacoes);
    }

    /** {@code (p1 OR p2 ...)} das situacoes, na ordem do enum, so com os predicados fixos. */
    static String emOu(Set<SituacaoDaPosicao> situacoes) {
        return EnumSet.copyOf(situacoes).stream()
                .map(situacao -> situacao.predicado)
                .collect(Collectors.joining(" OR ", "(", ")"));
    }

    /**
     * Le uma lista de valores de enum pela allow-list ({@link ParametroDaListagem#escolher}):
     * itens em branco sao ignorados, repetidos contam uma vez e o resultado e
     * um {@link EnumSet} imutavel (na ordem do enum).
     */
    static <E extends Enum<E>> Set<E> escolherTodos(E[] valores, Class<E> tipo, Function<E, String> nomeNaApi,
            List<String> recebidos, String mensagemInvalida, String campo) {
        EnumSet<E> escolhidos = EnumSet.noneOf(tipo);
        if (recebidos != null) {
            for (String recebido : recebidos) {
                if (!ParametroDaListagem.ausente(recebido)) {
                    escolhidos.add(ParametroDaListagem.escolher(valores, nomeNaApi, recebido,
                            () -> new RegraDeNegocioException(mensagemInvalida, campo)));
                }
            }
        }
        return Collections.unmodifiableSet(escolhidos);
    }
}
