package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.geitus.app.cashier.ponto.SessoesAbertasPorPonto;
import com.geitus.app.cashier.ponto.SituacaoDoPonto;

/**
 * Consultas nativas sobre {@code sessoes_caixa} (e o nome de quem abriu, em
 * {@code usuario}) que alimentam a lista de pontos. Fica no pacote de sessao,
 * dono da tabela; o de ponto so conhece a interface. O {@link JdbcTemplate}
 * participa da transacao JPA corrente. Toda consulta filtra pela empresa
 * (DEC-016) e nenhuma devolve valores do esperado (modo cego, spec 3.6).
 */
@Component
class SessoesAbertasPorPontoJdbc implements SessoesAbertasPorPonto {

    private static final String SITUACOES = """
            SELECT s.ponto_caixa_id, s.status, s.uuid, u.nome, s.aberta_em
            FROM sessoes_caixa s
            JOIN usuario u ON u.empresa_id = s.empresa_id AND u.id = s.aberta_por
            WHERE s.empresa_id = ? AND s.status IN ('ABERTA', 'EM_CONFERENCIA')
            """;

    /** Por ponto, a abertura mais recente: um passo no indice {@code ix_sessao_caixa_ponto} por ponto. */
    private static final String ULTIMOS_FUNDOS = """
            SELECT p.id AS ponto_caixa_id, ultima.fundo_troco
            FROM pontos_caixa p
            CROSS JOIN LATERAL (
                SELECT s.fundo_troco
                FROM sessoes_caixa s
                WHERE s.empresa_id = p.empresa_id AND s.ponto_caixa_id = p.id
                ORDER BY s.aberta_em DESC, s.id DESC
                LIMIT 1) ultima
            WHERE p.empresa_id = ?
            """;

    private static final String TEM_SESSAO_ABERTA = """
            SELECT EXISTS (
                SELECT 1 FROM sessoes_caixa
                WHERE empresa_id = ? AND ponto_caixa_id = ? AND status IN ('ABERTA', 'EM_CONFERENCIA'))
            """;

    private final JdbcTemplate jdbcTemplate;

    SessoesAbertasPorPontoJdbc(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public Map<Long, SituacaoDoPonto> situacoes(Long empresaId) {
        Map<Long, SituacaoDoPonto> porPonto = new HashMap<>();
        jdbcTemplate.query(SITUACOES, linha -> {
            porPonto.put(linha.getLong("ponto_caixa_id"), new SituacaoDoPonto(linha.getString("status"),
                    linha.getObject("uuid", UUID.class), linha.getString("nome"),
                    linha.getObject("aberta_em", OffsetDateTime.class)));
        }, empresaId);
        return porPonto;
    }

    @Override
    public Map<Long, BigDecimal> ultimosFundos(Long empresaId) {
        Map<Long, BigDecimal> porPonto = new HashMap<>();
        jdbcTemplate.query(ULTIMOS_FUNDOS,
                linha -> {
                    porPonto.put(linha.getLong("ponto_caixa_id"), linha.getBigDecimal("fundo_troco"));
                }, empresaId);
        return porPonto;
    }

    @Override
    public boolean temSessaoAberta(Long empresaId, Long pontoId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(TEM_SESSAO_ABERTA, Boolean.class, empresaId, pontoId));
    }
}
