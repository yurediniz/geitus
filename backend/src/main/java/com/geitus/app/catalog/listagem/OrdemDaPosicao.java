package com.geitus.app.catalog.listagem;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Ordenacao da posicao de estoque (spec de Estoque, regra 23). Cada valor guarda
 * o fragmento FIXO do {@code ORDER BY}; o texto do parametro so escolhe o valor.
 *
 * <p>O valor em custo e saldo x custo so com saldo &gt; 0 e custo informado; os
 * produtos sem valor ficam SEMPRE no fim, nas duas direcoes. Todo fragmento
 * termina no desempate por {@code p.nome_normalizado, p.id}.
 */
public enum OrdemDaPosicao {
    NOME("nome", "p.nome_normalizado"),
    NOME_DESC("-nome", "p.nome_normalizado DESC"),
    SALDO("saldo", OrdemDaPosicao.SALDO_DO_PRODUTO),
    SALDO_DESC("-saldo", OrdemDaPosicao.SALDO_DO_PRODUTO + " DESC"),
    VALOR("valor", OrdemDaPosicao.SEM_VALOR_NO_FIM + ", " + OrdemDaPosicao.VALOR_EM_CUSTO),
    VALOR_DESC("-valor", OrdemDaPosicao.SEM_VALOR_NO_FIM + ", " + OrdemDaPosicao.VALOR_EM_CUSTO + " DESC");

    static final String MENSAGEM_INVALIDA = "Ordenação inválida.";
    static final String CAMPO = "ordem";

    private static final String SALDO_DO_PRODUTO = "COALESCE(s.saldo, 0)";
    /** Mesma condicao do valor nulo na resposta e no resumo. */
    static final String TEM_VALOR = "p.custo IS NOT NULL AND COALESCE(s.saldo, 0) > 0";
    private static final String SEM_VALOR_NO_FIM = "CASE WHEN " + TEM_VALOR + " THEN 0 ELSE 1 END";
    private static final String VALOR_EM_CUSTO = "CASE WHEN " + TEM_VALOR + " THEN s.saldo * p.custo END";
    private static final String DESEMPATE = ", p.nome_normalizado, p.id";

    private final String nomeNaApi;
    private final String criterio;

    OrdemDaPosicao(String nomeNaApi, String criterio) {
        this.nomeNaApi = nomeNaApi;
        this.criterio = criterio;
    }

    /** Valor aceito no parametro da API (a allow-list; tambem anunciado na OpenAPI). */
    public String nomeNaApi() {
        return nomeNaApi;
    }

    /** Valor do parametro {@code ordem}; ausente ou vazio vale {@link #NOME}; desconhecido, 400. */
    public static OrdemDaPosicao doParametro(String valor) {
        if (ParametroDaListagem.ausente(valor)) {
            return NOME;
        }
        return ParametroDaListagem.escolher(values(), OrdemDaPosicao::nomeNaApi, valor,
                () -> new RegraDeNegocioException(MENSAGEM_INVALIDA, CAMPO));
    }

    /** Conteudo do {@code ORDER BY}, ja com o desempate. */
    String orderBy() {
        return criterio + DESEMPATE;
    }
}
