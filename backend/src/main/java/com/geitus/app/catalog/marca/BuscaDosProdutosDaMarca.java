package com.geitus.app.catalog.marca;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.shared.busca.TextoDeBusca;

/**
 * Recalcula a busca dos produtos de uma marca renomeada
 * (docs/modules/fornecedores-e-marcas.md, 3.3; Review Focus 3): os produtos
 * passam a ser achados pelo nome novo e deixam de ser pelo antigo.
 *
 * <p>Sem carregar entidades e sem N+1 por produto: os textos dos produtos da
 * marca sao lidos numa consulta so, o texto pesquisavel e montado em Java pelo
 * mesmo {@link TextoDeBusca#textoDoProduto} da entidade (a normalizacao fica
 * num lugar so) e gravado num {@code UPDATE} em lote ({@code batchUpdate}).
 * Exige a transacao do renomear ({@link Propagation#MANDATORY}): a marca e a
 * busca mudam juntas ou nada muda.
 *
 * <p>SQL fixo com parametros nomeados, sempre filtrado pela empresa (DEC-016).
 */
@Component
class BuscaDosProdutosDaMarca {

    private static final String PRODUTOS_DA_MARCA = """
            SELECT p.id, p.nome, p.nome_curto, p.sku
              FROM produtos p
             WHERE p.empresa_id = :empresaId
               AND p.marca_id = :marcaId""";
    private static final String ATUALIZAR_BUSCA = """
            UPDATE produtos
               SET busca_normalizada = :busca
             WHERE empresa_id = :empresaId
               AND id = :id""";

    private final NamedParameterJdbcTemplate jdbc;

    BuscaDosProdutosDaMarca(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Grava a busca de cada produto da marca com {@code nomeDaMarca}; sem produtos, nada e escrito. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void recalcular(Long empresaId, Long marcaId, String nomeDaMarca) {
        List<SqlParameterSource> atualizacoes = jdbc.query(PRODUTOS_DA_MARCA,
                Map.of("empresaId", empresaId, "marcaId", marcaId),
                (linha, numero) -> new MapSqlParameterSource()
                        .addValue("empresaId", empresaId)
                        .addValue("id", linha.getLong("id"))
                        .addValue("busca", TextoDeBusca.textoDoProduto(linha.getString("nome"),
                                linha.getString("nome_curto"), linha.getString("sku"), nomeDaMarca)));
        if (!atualizacoes.isEmpty()) {
            jdbc.batchUpdate(ATUALIZAR_BUSCA, atualizacoes.toArray(SqlParameterSource[]::new));
        }
    }
}
