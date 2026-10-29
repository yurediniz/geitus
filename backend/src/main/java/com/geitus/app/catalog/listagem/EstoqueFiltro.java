package com.geitus.app.catalog.listagem;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * Filtro de estoque da listagem (spec de Produtos), so para produtos que controlam
 * estoque, com multisselecao: as situacoes escolhidas se combinam com OU. O
 * saldo vem do {@code LEFT JOIN estoque_saldos s} (sem linha = 0). Os mesmos
 * valores e os mesmos predicados SQL FIXOS do filtro de situacao da posicao
 * ({@link SituacaoDaPosicao}), coerentes com {@code SituacaoEstoque}.
 */
public enum EstoqueFiltro {
    NEGATIVO(SituacaoDaPosicao.NEGATIVO),
    ZERADO(SituacaoDaPosicao.ZERADO),
    BAIXO(SituacaoDaPosicao.BAIXO),
    REPOSICAO(SituacaoDaPosicao.REPOSICAO),
    REGULAR(SituacaoDaPosicao.REGULAR),
    ALTO(SituacaoDaPosicao.ALTO);

    static final String MENSAGEM_INVALIDO = "Filtro de estoque inválido.";
    static final String CAMPO = "estoque";

    private final SituacaoDaPosicao situacao;

    EstoqueFiltro(SituacaoDaPosicao situacao) {
        this.situacao = situacao;
    }

    /** Valor aceito no parametro da API (a allow-list; tambem anunciado na OpenAPI). */
    public String nomeNaApi() {
        return situacao.nomeNaApi();
    }

    /**
     * Valores do parametro {@code estoque} (repetido ou separado por virgula):
     * ausente, vazio ou so com espacos e o conjunto vazio (sem filtro);
     * repetidos contam uma vez; qualquer valor desconhecido, 400.
     */
    public static Set<EstoqueFiltro> doParametro(List<String> valores) {
        return SituacaoDaPosicao.escolherTodos(values(), EstoqueFiltro.class, EstoqueFiltro::nomeNaApi, valores,
                MENSAGEM_INVALIDO, CAMPO);
    }

    /**
     * {@code AND p.controla_estoque AND (p1 OR p2 ...)} das situacoes escolhidas;
     * vazio e sem filtro ({@code ""}). O controle de estoque fica fora do OU.
     */
    static String condicao(Set<EstoqueFiltro> filtros) {
        if (filtros.isEmpty()) {
            return "";
        }
        EnumSet<SituacaoDaPosicao> situacoes = EnumSet.noneOf(SituacaoDaPosicao.class);
        filtros.forEach(filtro -> situacoes.add(filtro.situacao));
        return " AND p.controla_estoque AND " + SituacaoDaPosicao.emOu(situacoes);
    }
}
