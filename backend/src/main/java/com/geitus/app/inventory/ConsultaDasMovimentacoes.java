package com.geitus.app.inventory;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import com.geitus.app.inventory.dto.MovimentacaoDeEstoqueResponse;
import com.geitus.app.inventory.dto.MovimentacaoDeEstoqueResponse.ProdutoDaMovimentacao;
import com.geitus.app.inventory.dto.MovimentacaoDeEstoqueResponse.UnidadeDaMovimentacao;

/**
 * Movimentacoes de todos os produtos da empresa (docs/modules/estoque.md, regras
 * 26 e 27): a contagem e a pagina, do mais recente ao mais antigo, em duas
 * consultas, qualquer que seja o tamanho da pagina. Atende o indice
 * {@code ix_movimento_estoque_empresa_data} (V18).
 *
 * <p>O SQL e feito so de constantes e de fragmentos fixos escolhidos pelos
 * filtros presentes; os valores do usuario vao como parametro nomeado. Toda
 * juncao repete a empresa (DEC-016): produto, usuario ou venda de outra empresa
 * nunca entram, e um filtro de outra empresa so devolve a lista vazia.
 */
@Repository
public class ConsultaDasMovimentacoes {

    // Cada fragmento comeca com espaco: as partes sao concatenadas na ordem SELECT, FROM, juncoes, WHERE.
    private static final String DE = " FROM movimentos_estoque m"
            + " JOIN produtos p ON p.empresa_id = m.empresa_id AND p.id = m.produto_id";
    private static final String ONDE = " WHERE m.empresa_id = :empresaId"
            + " AND m.criado_em >= :inicio AND m.criado_em < :fim";
    private static final String DO_PRODUTO = " AND p.uuid = :produto";
    private static final String DO_TIPO = " AND m.tipo = :tipo";
    private static final String DO_MOTIVO = " AND m.motivo = :motivo";
    private static final String DO_USUARIO = " AND m.usuario_id = :usuario";

    private static final String CONTAGEM = "SELECT count(*)";
    private static final String LINHAS = "SELECT m.uuid, m.tipo, m.motivo, m.origem, m.quantidade, m.saldo_anterior,"
            + " m.saldo_novo, m.observacao, u.nome AS usuario_nome, m.criado_em, m.embalagem_rotulo,"
            + " m.embalagem_quantidade, m.quantidade_embalagens, m.custo_informado, m.custo_unitario,"
            + " f.uuid AS fornecedor_uuid, f.razao_social AS fornecedor_nome,"
            + " p.uuid AS produto_uuid, p.numero AS produto_numero, p.nome AS produto_nome,"
            + " un.sigla AS unidade_sigla, un.fracionada AS unidade_fracionada,"
            + " v.uuid AS venda_uuid, v.numero AS venda_numero";
    private static final String JUNCOES_DA_LINHA =
            " JOIN usuario u ON u.empresa_id = m.empresa_id AND u.id = m.usuario_id"
            + " JOIN unidades_medida un ON un.empresa_id = p.empresa_id AND un.id = p.unidade_id"
            + " LEFT JOIN fornecedores f ON f.empresa_id = m.empresa_id AND f.id = m.fornecedor_id"
            + " LEFT JOIN itens_venda iv ON iv.empresa_id = m.empresa_id AND iv.id = m.item_venda_id"
            + " LEFT JOIN vendas v ON v.empresa_id = iv.empresa_id AND v.id = iv.venda_id";
    private static final String ORDEM_E_PAGINA = " ORDER BY m.criado_em DESC, m.id DESC"
            + " LIMIT :tamanho OFFSET :deslocamento";

    private final NamedParameterJdbcTemplate jdbc;

    public ConsultaDasMovimentacoes(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Uma pagina (a partir de 0) e o total. Pagina alem do fim devolve as linhas vazias com o total real. */
    public PaginaDeMovimentacoes buscar(Long empresaId, ParametrosDasMovimentacoes filtro) {
        MapSqlParameterSource parametros = new MapSqlParameterSource("empresaId", empresaId)
                // criado_em e TIMESTAMP sem fuso (DT-030): de 00:00 do primeiro dia ate 00:00 do dia seguinte ao ultimo.
                .addValue("inicio", filtro.de().atStartOfDay())
                .addValue("fim", filtro.ate().plusDays(1).atStartOfDay());
        StringBuilder condicoes = new StringBuilder();
        if (filtro.produto() != null) {
            condicoes.append(DO_PRODUTO);
            parametros.addValue("produto", filtro.produto());
        }
        if (filtro.tipo() != null) {
            condicoes.append(DO_TIPO);
            parametros.addValue("tipo", filtro.tipo().name());
        }
        if (filtro.motivo() != null) {
            condicoes.append(DO_MOTIVO);
            parametros.addValue("motivo", filtro.motivo().name());
        }
        if (filtro.usuario() != null) {
            condicoes.append(DO_USUARIO);
            parametros.addValue("usuario", filtro.usuario());
        }

        long total = jdbc.queryForObject(CONTAGEM + DE + ONDE + condicoes, parametros, Long.class);
        long deslocamento = (long) filtro.pagina() * filtro.tamanho();
        if (deslocamento >= total) {
            return new PaginaDeMovimentacoes(List.of(), total);
        }
        parametros.addValue("tamanho", filtro.tamanho()).addValue("deslocamento", deslocamento);
        List<MovimentacaoDeEstoqueResponse> linhas = jdbc.query(LINHAS + DE + JUNCOES_DA_LINHA + ONDE + condicoes
                + ORDEM_E_PAGINA, parametros, (linha, numero) -> daLinha(linha));
        return new PaginaDeMovimentacoes(linhas, total);
    }

    private static MovimentacaoDeEstoqueResponse daLinha(ResultSet linha) throws SQLException {
        Integer quantidadeEmbalagens = linha.getObject("quantidade_embalagens", Integer.class);
        Long vendaNumero = linha.getObject("venda_numero", Long.class);
        return MovimentacaoDeEstoqueResponse.daLinha(
                linha.getObject("uuid", UUID.class),
                TipoMovimento.valueOf(linha.getString("tipo")),
                MotivoMovimento.valueOf(linha.getString("motivo")),
                OrigemMovimento.valueOf(linha.getString("origem")),
                linha.getBigDecimal("quantidade"),
                linha.getBigDecimal("saldo_anterior"),
                linha.getBigDecimal("saldo_novo"),
                linha.getString("observacao"),
                linha.getString("usuario_nome"),
                linha.getObject("criado_em", LocalDateTime.class),
                linha.getString("embalagem_rotulo"),
                linha.getBigDecimal("embalagem_quantidade"),
                quantidadeEmbalagens,
                linha.getBigDecimal("custo_informado"),
                linha.getBigDecimal("custo_unitario"),
                linha.getObject("fornecedor_uuid", UUID.class),
                linha.getString("fornecedor_nome"),
                new ProdutoDaMovimentacao(linha.getObject("produto_uuid", UUID.class), linha.getLong("produto_numero"),
                        linha.getString("produto_nome"), new UnidadeDaMovimentacao(linha.getString("unidade_sigla"),
                                linha.getBoolean("unidade_fracionada"))),
                linha.getObject("venda_uuid", UUID.class),
                vendaNumero);
    }

    /** As linhas da pagina e o total do filtro. */
    public record PaginaDeMovimentacoes(List<MovimentacaoDeEstoqueResponse> linhas, long total) {
    }
}
