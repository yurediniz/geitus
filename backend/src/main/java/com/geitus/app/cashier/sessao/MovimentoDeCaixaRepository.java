package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Acesso aos movimentos de caixa, sempre filtrado pela empresa (DEC-016). So
 * insercao e leitura: o banco recusa alterar e apagar movimentos.
 */
public interface MovimentoDeCaixaRepository extends Repository<MovimentoDeCaixa, Long> {

    MovimentoDeCaixa saveAndFlush(MovimentoDeCaixa movimento);

    Optional<MovimentoDeCaixa> findByEmpresaIdAndChaveIdempotencia(Long empresaId, UUID chave);

    /** Os movimentos do tipo informado ligados a venda (os recebimentos que o cancelamento estorna). */
    List<MovimentoDeCaixa> findByEmpresaIdAndVendaIdAndTipo(Long empresaId, Long vendaId, TipoDeMovimentoDeCaixa tipo);

    /** Movimentos da sessao, do mais recente para o mais antigo. */
    List<MovimentoDeCaixa> findByEmpresaIdAndSessaoCaixaIdOrderByCriadoEmDescIdDesc(Long empresaId, Long sessaoId);

    /**
     * Dinheiro esperado na gaveta: abertura + suprimentos + recebimentos -
     * sangrias - estornos, so em dinheiro. Nao e coluna: e sempre esta soma
     * (spec 2; docs/modules/pdv.md, 3.9).
     */
    @Query(value = """
            SELECT COALESCE(SUM(CASE WHEN tipo IN ('SANGRIA', 'ESTORNO') THEN -valor ELSE valor END), 0)
            FROM movimentos_caixa
            WHERE empresa_id = :empresaId AND sessao_caixa_id = :sessaoId AND forma = 'DINHEIRO'
            """, nativeQuery = true)
    BigDecimal esperado(@Param("empresaId") Long empresaId, @Param("sessaoId") Long sessaoId);

    /**
     * Esperado de cada forma com movimento nas sessoes, numa consulta: linhas
     * {@code [sessao_caixa_id, forma, esperado]}. Os ids vao num unico
     * parametro de array ({@code = ANY}); atende o {@code ix_movimento_caixa_sessao}.
     * Use {@code EsperadoPorForma}.
     */
    @Query(value = """
            SELECT sessao_caixa_id, forma,
                   COALESCE(SUM(CASE WHEN tipo IN ('SANGRIA', 'ESTORNO') THEN -valor ELSE valor END), 0)
            FROM movimentos_caixa
            WHERE empresa_id = :empresaId AND sessao_caixa_id = ANY(:sessaoIds)
            GROUP BY sessao_caixa_id, forma
            """, nativeQuery = true)
    List<Object[]> esperadosPorForma(@Param("empresaId") Long empresaId, @Param("sessaoIds") Long[] sessaoIds);
}
