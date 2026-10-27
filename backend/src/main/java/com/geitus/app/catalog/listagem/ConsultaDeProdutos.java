package com.geitus.app.catalog.listagem;

import java.util.List;
import java.util.Locale;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import com.geitus.app.shared.busca.PadraoLike;

/**
 * Etapa 1 da listagem de produtos (docs/modules/produtos.md): os
 * ids da pagina, na ordem pedida, e o total que passa nos filtros. Leitura
 * nativa com {@link NamedParameterJdbcTemplate}; a etapa 2 (os produtos com as
 * relacoes) fica no {@code ProdutoService}.
 *
 * <p><b>Montagem do SQL (seguranca):</b> o texto do SQL e feito SO de
 * constantes desta classe e dos fragmentos fixos dos enums
 * ({@link StatusFiltro}, {@link EstoqueFiltro}, {@link OrdemDeProdutos}). Os
 * unicos nomes gerados sao {@code :palavra0} a {@code :palavra4}, pelo indice
 * da palavra (no maximo {@value com.geitus.app.shared.busca.TextoDeBusca#MAXIMO_DE_PALAVRAS}, garantido
 * pelo {@link FiltroDeProdutos}). Todo valor do usuario (palavras, codigo, termo numerico,
 * categorias, data, pagina) vai como parametro nomeado; os padroes {@code LIKE}
 * escapam {@code %}, {@code _} e {@code \} ({@link PadraoLike}, DT-017) com
 * {@code ESCAPE '\'}.
 *
 * <p>Sempre filtrada por {@code p.empresa_id} (DEC-016). O {@code LEFT JOIN} com
 * {@code estoque_saldos} (unico por produto, entao nao duplica linhas) e o
 * acoplamento de leitura com o estoque, so no SQL.
 *
 * <p>Consultas: uma contagem e, se a pagina tiver itens, a dos ids. Categoria
 * impossivel (conjunto vazio) responde vazio sem consultar.
 */
@Repository
public class ConsultaDeProdutos {

    private static final String ORIGEM = """
             FROM produtos p
             LEFT JOIN estoque_saldos s ON s.empresa_id = p.empresa_id AND s.produto_id = p.id
            WHERE p.empresa_id = :empresaId""";
    private static final String CONTAGEM = "SELECT count(*)";
    private static final String IDS = "SELECT p.id";
    private static final String PAGINA = " LIMIT :tamanho OFFSET :deslocamento";

    private static final String PALAVRA = "p.busca_normalizada LIKE :palavra%d ESCAPE '\\'";
    private static final String CODIGO = """
            EXISTS (SELECT 1 FROM produto_codigos_barras c
                     WHERE c.empresa_id = p.empresa_id AND c.produto_id = p.id
                       AND lower(c.codigo) LIKE :codigo ESCAPE '\\')""";
    /** Fase B2: numero de registro ou codigo do produto iguais ao termo numerico (indices unicos da V11). */
    private static final String NUMERO_OU_CODIGO = "p.numero = :termoNumerico OR p.codigo = :termoNumerico";
    private static final String CATEGORIAS = " AND p.categoria_id = ANY(:categoriaIds)";
    private static final String PROMOCAO_VIGENTE =
            " AND p.preco_promocional IS NOT NULL AND :hoje BETWEEN p.promocao_inicio AND p.promocao_fim";

    private final NamedParameterJdbcTemplate jdbc;

    public ConsultaDeProdutos(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Ids da {@code pagina} (a partir de 0) com {@code tamanho} itens e o total.
     * Pagina alem do fim devolve {@code ids} vazio com o total real. Os limites
     * de pagina e tamanho sao validados antes, pelo {@code Paginacao.validar}.
     */
    public PaginaDeIds buscar(FiltroDeProdutos filtro, OrdemDeProdutos ordem, int pagina, int tamanho) {
        if (pagina < 0 || tamanho < 1) {
            throw new IllegalArgumentException("Pagina ou tamanho fora dos limites.");
        }
        if (filtro.semCategoriaPossivel()) {
            return PaginaDeIds.VAZIA;
        }
        MapSqlParameterSource parametros = new MapSqlParameterSource("empresaId", filtro.empresaId());
        String origemFiltrada = ORIGEM + condicoes(filtro, parametros);

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

    /** Os {@code AND} dos filtros presentes, so com fragmentos fixos; os valores entram em {@code parametros}. */
    private static String condicoes(FiltroDeProdutos filtro, MapSqlParameterSource parametros) {
        StringBuilder sql = new StringBuilder(filtro.status().condicao());
        if (filtro.temBusca()) {
            sql.append(" AND (").append(condicaoDeBusca(filtro, parametros)).append(')');
        }
        if (filtro.categoriaIds() != null) {
            sql.append(CATEGORIAS);
            parametros.addValue("categoriaIds", filtro.categoriaIds().toArray(Long[]::new));
        }
        if (filtro.estoque() != null) {
            sql.append(filtro.estoque().condicao());
        }
        if (filtro.emPromocao()) {
            sql.append(PROMOCAO_VIGENTE);
            parametros.addValue("hoje", filtro.hoje());
        }
        return sql.toString();
    }

    /**
     * Spec de Produtos: todas as palavras (E, em qualquer ordem) no texto normalizado,
     * OU o termo sem espacos em qualquer codigo de barras, OU (Fase B2, termo so
     * de digitos) o numero ou o codigo do produto iguais ao termo sem zeros.
     */
    private static String condicaoDeBusca(FiltroDeProdutos filtro, MapSqlParameterSource parametros) {
        StringBuilder sql = new StringBuilder();
        List<String> palavras = filtro.palavras();
        if (!palavras.isEmpty()) {
            sql.append('(');
            for (int indice = 0; indice < palavras.size(); indice++) {
                if (indice > 0) {
                    sql.append(" AND ");
                }
                sql.append(PALAVRA.formatted(indice));
                parametros.addValue("palavra" + indice, PadraoLike.contem(palavras.get(indice)));
            }
            sql.append(')');
        }
        if (filtro.termoDeCodigo() != null) {
            if (!palavras.isEmpty()) {
                sql.append(" OR ");
            }
            sql.append(CODIGO);
            parametros.addValue("codigo", PadraoLike.contem(filtro.termoDeCodigo().toLowerCase(Locale.ROOT)));
        }
        if (filtro.termoNumerico() != null) {
            if (!sql.isEmpty()) {
                sql.append(" OR ");
            }
            sql.append(NUMERO_OU_CODIGO);
            parametros.addValue("termoNumerico", filtro.termoNumerico());
        }
        return sql.toString();
    }
}
