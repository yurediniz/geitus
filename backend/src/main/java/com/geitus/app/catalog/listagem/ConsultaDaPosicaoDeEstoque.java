package com.geitus.app.catalog.listagem;

import java.math.RoundingMode;
import java.util.List;
import java.util.Set;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Etapa 1 da posicao de estoque (docs/modules/estoque.md, regras 22 a 24): os
 * ids da pagina e o resumo, so dos produtos que controlam estoque. Usa a mesma
 * origem e as mesmas condicoes de busca, categoria e status da listagem de
 * produtos ({@link ConsultaDeProdutos#condicoes}), para os dois resultados
 * casarem; o filtro de estoque e a promocao do {@link FiltroDeProdutos} nao
 * se aplicam aqui.
 *
 * <p>O SQL e feito so de constantes e dos fragmentos fixos dos enums
 * ({@link SituacaoDaPosicao}, {@link OrdemDaPosicao}); os valores do usuario vao
 * como parametro nomeado (ver {@link ConsultaDeProdutos}).
 */
@Repository
public class ConsultaDaPosicaoDeEstoque {

    private static final String SO_CONTROLADOS = " AND p.controla_estoque";
    private static final String CONTAGEM = "SELECT count(*)";
    private static final String IDS = "SELECT p.id";
    private static final String PAGINA = " LIMIT :tamanho OFFSET :deslocamento";
    private static final String RESUMO = "SELECT count(*) AS produtos,"
            + " count(*) FILTER (WHERE " + SituacaoDaPosicao.SALDO_NEGATIVO + ") AS negativos,"
            + " count(*) FILTER (WHERE " + SituacaoDaPosicao.SALDO_ZERADO + ") AS zerados,"
            + " count(*) FILTER (WHERE " + SituacaoDaPosicao.ESTOQUE_BAIXO + ") AS baixo,"
            + " count(*) FILTER (WHERE " + SituacaoDaPosicao.EM_REPOSICAO + ") AS reposicao,"
            + " count(*) FILTER (WHERE " + SituacaoDaPosicao.ESTOQUE_ALTO + ") AS alto,"
            + " COALESCE(sum(round(s.saldo * p.custo, 2)) FILTER (WHERE " + OrdemDaPosicao.TEM_VALOR + "), 0)"
            + " AS valor_total,"
            + " count(*) FILTER (WHERE p.custo IS NULL AND COALESCE(s.saldo, 0) > 0) AS sem_custo";

    private final NamedParameterJdbcTemplate jdbc;

    public ConsultaDaPosicaoDeEstoque(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Ids da {@code pagina} (a partir de 0) e o total. As {@code situacoes} se
     * combinam com OU; vazio e sem filtro. Pagina alem do fim devolve {@code ids} vazio com o total real.
     */
    public PaginaDeIds buscar(FiltroDeProdutos filtro, Set<SituacaoDaPosicao> situacoes, OrdemDaPosicao ordem,
            int pagina, int tamanho) {
        if (pagina < 0 || tamanho < 1) {
            throw new IllegalArgumentException("Pagina ou tamanho fora dos limites.");
        }
        if (filtro.semCategoriaPossivel()) {
            return PaginaDeIds.VAZIA;
        }
        MapSqlParameterSource parametros = new MapSqlParameterSource("empresaId", filtro.empresaId());
        String origemFiltrada = origem(filtro, parametros) + SituacaoDaPosicao.condicao(situacoes);

        long total = jdbc.queryForObject(CONTAGEM + origemFiltrada, parametros, Long.class);
        long deslocamento = (long) pagina * tamanho;
        if (deslocamento >= total) {
            return new PaginaDeIds(List.of(), total);
        }
        parametros.addValue("tamanho", tamanho).addValue("deslocamento", deslocamento);
        List<Long> ids = jdbc.queryForList(IDS + origemFiltrada + " ORDER BY " + ordem.orderBy() + PAGINA,
                parametros, Long.class);
        return new PaginaDeIds(ids, total);
    }

    /** Resumo numa consulta so, para busca, categoria e status do filtro. */
    public ResumoDaPosicao resumir(FiltroDeProdutos filtro) {
        if (filtro.semCategoriaPossivel()) {
            return ResumoDaPosicao.VAZIO;
        }
        MapSqlParameterSource parametros = new MapSqlParameterSource("empresaId", filtro.empresaId());
        return jdbc.queryForObject(RESUMO + origem(filtro, parametros), parametros,
                (linha, numero) -> new ResumoDaPosicao(linha.getLong("produtos"), linha.getLong("negativos"),
                        linha.getLong("zerados"), linha.getLong("baixo"), linha.getLong("reposicao"),
                        linha.getLong("alto"),
                        linha.getBigDecimal("valor_total").setScale(2, RoundingMode.HALF_UP),
                        linha.getLong("sem_custo")));
    }

    private static String origem(FiltroDeProdutos filtro, MapSqlParameterSource parametros) {
        if (!filtro.estoque().isEmpty() || filtro.emPromocao()) {
            throw new IllegalArgumentException("A posicao nao usa os filtros de estoque e de promocao da listagem.");
        }
        return ConsultaDeProdutos.ORIGEM + SO_CONTROLADOS + ConsultaDeProdutos.condicoes(filtro, parametros);
    }
}
