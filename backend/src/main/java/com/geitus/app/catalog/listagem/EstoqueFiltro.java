package com.geitus.app.catalog.listagem;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Filtro de estoque da listagem (spec de Produtos), so para produtos que controlam
 * estoque; o saldo vem do {@code LEFT JOIN estoque_saldos s} (sem linha = 0).
 * Cada valor guarda o fragmento SQL FIXO do {@code WHERE}, coerente com
 * {@code SituacaoEstoque}: {@link #BAIXO} inclui os sem estoque.
 */
public enum EstoqueFiltro {
    /** Saldo ate o ponto de reposicao (ou, sem ponto, ate o minimo), incluindo os zerados. */
    BAIXO("baixo", " AND p.controla_estoque AND (COALESCE(s.saldo, 0) <= 0"
            + " OR COALESCE(s.saldo, 0) <= COALESCE(p.ponto_reposicao, p.estoque_minimo))"),
    /** Saldo menor ou igual a zero. */
    SEM("sem", " AND p.controla_estoque AND COALESCE(s.saldo, 0) <= 0");

    static final String MENSAGEM_INVALIDO = "Filtro de estoque inválido.";
    static final String CAMPO = "estoque";

    private final String nomeNaApi;
    private final String condicao;

    EstoqueFiltro(String nomeNaApi, String condicao) {
        this.nomeNaApi = nomeNaApi;
        this.condicao = condicao;
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
