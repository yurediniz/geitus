package com.geitus.app.catalog.listagem;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Filtro de status da listagem (spec 4.2). Cada valor guarda o fragmento SQL
 * FIXO que acrescenta ao {@code WHERE}; o texto do parametro nunca chega ao SQL.
 */
public enum StatusFiltro {
    ATIVOS("ativos", " AND p.ativo"),
    INATIVOS("inativos", " AND NOT p.ativo"),
    TODOS("todos", "");

    static final String MENSAGEM_INVALIDO = "Status inválido.";
    static final String CAMPO = "status";

    private final String nomeNaApi;
    private final String condicao;

    StatusFiltro(String nomeNaApi, String condicao) {
        this.nomeNaApi = nomeNaApi;
        this.condicao = condicao;
    }

    /** Valor do parametro {@code status}; ausente ou vazio vale {@link #ATIVOS}; desconhecido, 400. */
    public static StatusFiltro doParametro(String valor) {
        if (ParametroDaListagem.ausente(valor)) {
            return ATIVOS;
        }
        return ParametroDaListagem.escolher(values(), filtro -> filtro.nomeNaApi, valor,
                () -> new RegraDeNegocioException(MENSAGEM_INVALIDO, CAMPO));
    }

    String condicao() {
        return condicao;
    }
}
