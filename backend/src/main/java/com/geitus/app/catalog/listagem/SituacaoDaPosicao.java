package com.geitus.app.catalog.listagem;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Filtro de situacao da posicao de estoque (spec de Estoque, regra 23). Cada
 * valor guarda o fragmento SQL FIXO do {@code WHERE}, coerente com
 * {@code SituacaoEstoque}: {@link #BAIXO} inclui os sem estoque e
 * {@link #NEGATIVO} esta contido em {@link #SEM}. O controle de estoque ja e
 * exigido pela propria consulta da posicao.
 */
public enum SituacaoDaPosicao {
    /** Saldo menor ou igual a zero. */
    SEM("sem", " AND " + SituacaoDaPosicao.SEM_ESTOQUE),
    /** Saldo ate o ponto de reposicao (ou, sem ponto, ate o minimo), incluindo os zerados. */
    BAIXO("baixo", " AND " + SituacaoDaPosicao.ESTOQUE_BAIXO),
    /** Saldo menor que zero (so a venda deixa o saldo negativo). */
    NEGATIVO("negativo", " AND " + SituacaoDaPosicao.SALDO_NEGATIVO);

    static final String MENSAGEM_INVALIDA = "Situação de estoque inválida.";
    static final String CAMPO = "situacao";

    // Condicoes compartilhadas com o EstoqueFiltro da listagem de produtos: os dois filtros nao divergem.
    static final String SEM_ESTOQUE = "COALESCE(s.saldo, 0) <= 0";
    static final String ESTOQUE_BAIXO = "(COALESCE(s.saldo, 0) <= 0"
            + " OR COALESCE(s.saldo, 0) <= COALESCE(p.ponto_reposicao, p.estoque_minimo))";
    static final String SALDO_NEGATIVO = "COALESCE(s.saldo, 0) < 0";

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
