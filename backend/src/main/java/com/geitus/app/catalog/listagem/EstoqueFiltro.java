package com.geitus.app.catalog.listagem;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Filtro de estoque da listagem (spec de Produtos), so para produtos que controlam
 * estoque; o saldo vem do {@code LEFT JOIN estoque_saldos s} (sem linha = 0).
 * Os mesmos valores e os mesmos fragmentos SQL FIXOS do filtro de situacao da
 * posicao ({@link SituacaoDaPosicao}), coerentes com {@code SituacaoEstoque}.
 */
public enum EstoqueFiltro {
    /** Precisa de atencao: negativo, zerado, baixo ou reposicao. */
    REPOR(SituacaoDaPosicao.REPOR),
    NEGATIVO(SituacaoDaPosicao.NEGATIVO),
    ZERADO(SituacaoDaPosicao.ZERADO),
    BAIXO(SituacaoDaPosicao.BAIXO),
    REPOSICAO(SituacaoDaPosicao.REPOSICAO),
    REGULAR(SituacaoDaPosicao.REGULAR),
    ALTO(SituacaoDaPosicao.ALTO);

    static final String MENSAGEM_INVALIDO = "Filtro de estoque inválido.";
    static final String CAMPO = "estoque";

    private final String nomeNaApi;
    private final String condicao;

    EstoqueFiltro(SituacaoDaPosicao situacao) {
        this.nomeNaApi = situacao.nomeNaApi();
        this.condicao = " AND p.controla_estoque" + situacao.condicao();
    }

    /** Valor aceito no parametro da API (a allow-list; tambem anunciado na OpenAPI). */
    public String nomeNaApi() {
        return nomeNaApi;
    }

    /** Valor do parametro {@code estoque}; ausente ou vazio e {@code null} (sem filtro); desconhecido, 400. */
    public static EstoqueFiltro doParametro(String valor) {
        if (ParametroDaListagem.ausente(valor)) {
            return null;
        }
        return ParametroDaListagem.escolher(values(), EstoqueFiltro::nomeNaApi, valor,
                () -> new RegraDeNegocioException(MENSAGEM_INVALIDO, CAMPO));
    }

    String condicao() {
        return condicao;
    }
}
