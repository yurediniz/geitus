package com.geitus.app.catalog.listagem;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Filtro de situacao da posicao de estoque (spec de Estoque, regras 16 e 23).
 * Cada valor guarda o fragmento SQL FIXO do {@code WHERE}, o mesmo de
 * {@code SituacaoEstoque} em Java: as seis situacoes sao exclusivas e
 * {@link #REPOR} junta negativo, zerado, baixo e reposicao. O controle de
 * estoque ja e exigido pela propria consulta da posicao; a listagem de
 * produtos usa as mesmas condicoes ({@link EstoqueFiltro}).
 */
public enum SituacaoDaPosicao {
    /** Precisa de atencao: negativo, zerado, baixo ou reposicao. */
    REPOR("repor", " AND " + SituacaoDaPosicao.A_REPOR),
    /** Saldo menor que zero (so a venda deixa o saldo negativo). */
    NEGATIVO("negativo", " AND " + SituacaoDaPosicao.SALDO_NEGATIVO),
    /** Saldo igual a zero. */
    ZERADO("zerado", " AND " + SituacaoDaPosicao.SALDO_ZERADO),
    /** Saldo positivo ate o minimo. */
    BAIXO("baixo", " AND " + SituacaoDaPosicao.ESTOQUE_BAIXO),
    /** Saldo acima do minimo (ou sem minimo) e ate o ponto de reposicao. */
    REPOSICAO("reposicao", " AND " + SituacaoDaPosicao.EM_REPOSICAO),
    /** Nenhuma das outras: saldo positivo, acima dos niveis informados e ate o maximo. */
    REGULAR("regular", " AND " + SituacaoDaPosicao.ESTOQUE_REGULAR),
    /** Saldo acima do maximo (acima do minimo e do ponto, pela regra 15). */
    ALTO("alto", " AND " + SituacaoDaPosicao.ESTOQUE_ALTO);

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
    // A uniao das quatro primeiras, mesmo com minimo > ponto (dado anterior a regra 15).
    static final String A_REPOR = "(" + SALDO + " <= 0"
            + " OR " + SALDO + " <= p.estoque_minimo OR " + SALDO + " <= p.ponto_reposicao)";

    private final String nomeNaApi;
    private final String condicao;

    SituacaoDaPosicao(String nomeNaApi, String condicao) {
        this.nomeNaApi = nomeNaApi;
        this.condicao = condicao;
    }

    /** Valor aceito no parametro da API (a allow-list; tambem anunciado na OpenAPI). */
    public String nomeNaApi() {
        return nomeNaApi;
    }

    /** Valor do parametro {@code situacao}; ausente ou vazio e {@code null} (sem filtro); desconhecido, 400. */
    public static SituacaoDaPosicao doParametro(String valor) {
        if (ParametroDaListagem.ausente(valor)) {
            return null;
        }
        return ParametroDaListagem.escolher(values(), SituacaoDaPosicao::nomeNaApi, valor,
                () -> new RegraDeNegocioException(MENSAGEM_INVALIDA, CAMPO));
    }

    String condicao() {
        return condicao;
    }
}
