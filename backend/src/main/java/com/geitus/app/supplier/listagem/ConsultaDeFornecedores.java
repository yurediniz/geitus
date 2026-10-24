package com.geitus.app.supplier.listagem;

import java.util.List;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import com.geitus.app.catalog.listagem.PaginaDeIds;
import com.geitus.app.catalog.listagem.StatusFiltro;
import com.geitus.app.shared.busca.PadraoLike;

/**
 * Etapa 1 da listagem de fornecedores (docs/modules/fornecedores-e-marcas.md,
 * 4.7): os ids da pagina, por nome, e o total que passa nos filtros. Leitura
 * nativa com {@link NamedParameterJdbcTemplate}, no padrao da
 * {@code ConsultaDeProdutos} (Fase E).
 *
 * <p><b>Montagem do SQL (seguranca):</b> o texto e feito SO de constantes desta
 * classe; os unicos nomes gerados sao {@code :palavra0} a {@code :palavra4},
 * pelo indice da palavra (no maximo
 * {@value com.geitus.app.shared.busca.TextoDeBusca#MAXIMO_DE_PALAVRAS}). Todo
 * valor do usuario vai como parametro nomeado, e os padroes {@code LIKE}
 * escapam {@code %}, {@code _} e {@code \} ({@link PadraoLike}).
 *
 * <p>Sempre filtrada por {@code f.empresa_id} (DEC-016). Ordem: o nome
 * normalizado (sem acento, collation "C" da V14) e o id.
 */
@Repository
public class ConsultaDeFornecedores {

    private static final String ORIGEM = """
             FROM fornecedores f
            WHERE f.empresa_id = :empresaId""";
    private static final String CONTAGEM = "SELECT count(*)";
    private static final String IDS = "SELECT f.id";
    private static final String ORDEM_E_PAGINA =
            " ORDER BY f.nome_normalizado, f.id LIMIT :tamanho OFFSET :deslocamento";

    private static final String ATIVOS = " AND f.ativo";
    private static final String INATIVOS = " AND NOT f.ativo";
    private static final String PALAVRA = "f.busca_normalizada LIKE :palavra%d ESCAPE '\\'";
    private static final String DOCUMENTO = "f.documento LIKE :documento ESCAPE '\\'";
    private static final String NUMERO = "f.numero = :termoNumerico";

    private final NamedParameterJdbcTemplate jdbc;

    public ConsultaDeFornecedores(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Ids da {@code pagina} (a partir de 0) com {@code tamanho} itens e o total; limites ja validados. */
    public PaginaDeIds buscar(FiltroDeFornecedores filtro, int pagina, int tamanho) {
        MapSqlParameterSource parametros = new MapSqlParameterSource("empresaId", filtro.empresaId());
        String origemFiltrada = ORIGEM + condicaoDeStatus(filtro.status()) + condicaoDeBusca(filtro, parametros);

        long total = jdbc.queryForObject(CONTAGEM + origemFiltrada, parametros, Long.class);
        long deslocamento = (long) pagina * tamanho;
        if (deslocamento >= total) {
            return new PaginaDeIds(List.of(), total);
        }
        parametros.addValue("tamanho", tamanho).addValue("deslocamento", deslocamento);
        return new PaginaDeIds(jdbc.queryForList(IDS + origemFiltrada + ORDEM_E_PAGINA, parametros, Long.class),
                total);
    }

    private static String condicaoDeStatus(StatusFiltro status) {
        return switch (status) {
            case ATIVOS -> ATIVOS;
            case INATIVOS -> INATIVOS;
            case TODOS -> "";
        };
    }

    /** Todas as palavras (E, em qualquer ordem) no texto normalizado, OU parte do documento, OU o Nº. */
    private static String condicaoDeBusca(FiltroDeFornecedores filtro, MapSqlParameterSource parametros) {
        if (!filtro.temBusca()) {
            return "";
        }
        StringBuilder sql = new StringBuilder(" AND (");
        String separador = "";
        List<String> palavras = filtro.palavras();
        if (!palavras.isEmpty()) {
            sql.append('(');
            for (int indice = 0; indice < palavras.size(); indice++) {
                sql.append(indice > 0 ? " AND " : "").append(PALAVRA.formatted(indice));
                parametros.addValue("palavra" + indice, PadraoLike.contem(palavras.get(indice)));
            }
            sql.append(')');
            separador = " OR ";
        }
        if (filtro.digitosDoDocumento() != null) {
            sql.append(separador).append(DOCUMENTO);
            parametros.addValue("documento", PadraoLike.contem(filtro.digitosDoDocumento()));
            separador = " OR ";
        }
        if (filtro.termoNumerico() != null) {
            sql.append(separador).append(NUMERO);
            parametros.addValue("termoNumerico", filtro.termoNumerico());
        }
        return sql.append(')').toString();
    }
}
