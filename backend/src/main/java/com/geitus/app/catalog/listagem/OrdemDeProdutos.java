package com.geitus.app.catalog.listagem;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Ordenacao da listagem (spec 4.3). Cada valor guarda o fragmento FIXO do
 * {@code ORDER BY}; o texto do parametro so escolhe o valor, nunca chega ao SQL.
 *
 * <p>Todo fragmento termina no desempate por {@code p.nome_normalizado, p.id},
 * para a paginacao ser estavel. Margem e estoque agrupam antes os produtos sem
 * valor (sem custo ou preco zero; sem controle de estoque), que ficam SEMPRE no
 * fim, nas duas direcoes, e entre si por nome: a chave de ordenacao deles e
 * nula e empata.
 */
public enum OrdemDeProdutos {
    NOME("nome", "p.nome_normalizado"),
    NOME_DESC("-nome", "p.nome_normalizado DESC"),
    PRECO("preco", "p.preco_venda"),
    PRECO_DESC("-preco", "p.preco_venda DESC"),
    MARGEM("margem", OrdemDeProdutos.SEM_MARGEM_NO_FIM + ", " + OrdemDeProdutos.MARGEM_CALCULADA),
    MARGEM_DESC("-margem", OrdemDeProdutos.SEM_MARGEM_NO_FIM + ", " + OrdemDeProdutos.MARGEM_CALCULADA + " DESC"),
    ESTOQUE("estoque", OrdemDeProdutos.SEM_CONTROLE_NO_FIM + ", " + OrdemDeProdutos.SALDO_CONTROLADO),
    ESTOQUE_DESC("-estoque", OrdemDeProdutos.SEM_CONTROLE_NO_FIM + ", " + OrdemDeProdutos.SALDO_CONTROLADO + " DESC"),
    RECENTES("recentes", "p.criado_em DESC"),
    ATUALIZADOS("atualizados", "COALESCE(p.atualizado_em, p.criado_em) DESC");

    static final String MENSAGEM_INVALIDA = "Ordenação inválida.";
    static final String CAMPO = "ordem";

    private static final String SEM_MARGEM_NO_FIM = "CASE WHEN p.custo IS NULL OR p.preco_venda = 0 THEN 1 ELSE 0 END";
    private static final String MARGEM_CALCULADA = "(p.preco_venda - p.custo) / NULLIF(p.preco_venda, 0)";
    private static final String SEM_CONTROLE_NO_FIM = "CASE WHEN p.controla_estoque THEN 0 ELSE 1 END";
    private static final String SALDO_CONTROLADO = "CASE WHEN p.controla_estoque THEN COALESCE(s.saldo, 0) END";
    private static final String DESEMPATE = ", p.nome_normalizado, p.id";

    private final String nomeNaApi;
    private final String criterio;

    OrdemDeProdutos(String nomeNaApi, String criterio) {
        this.nomeNaApi = nomeNaApi;
        this.criterio = criterio;
    }

    /** Valor do parametro {@code ordem}; ausente ou vazio vale {@link #NOME}; desconhecido, 400. */
    public static OrdemDeProdutos doParametro(String valor) {
        if (ParametroDaListagem.ausente(valor)) {
            return NOME;
        }
        return ParametroDaListagem.escolher(values(), ordem -> ordem.nomeNaApi, valor,
                () -> new RegraDeNegocioException(MENSAGEM_INVALIDA, CAMPO));
    }

    /** Conteudo do {@code ORDER BY}, ja com o desempate. */
    String orderBy() {
        return criterio + DESEMPATE;
    }
}
