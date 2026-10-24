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

    /** Movimentos da sessao, do mais recente para o mais antigo. */
    List<MovimentoDeCaixa> findByEmpresaIdAndSessaoCaixaIdOrderByCriadoEmDescIdDesc(Long empresaId, Long sessaoId);

    /**
     * Dinheiro esperado na gaveta: abertura + suprimentos - sangrias. Nao e
     * coluna: e sempre esta soma (spec 2).
     */
    @Query(value = """
            SELECT COALESCE(SUM(CASE WHEN tipo = 'SANGRIA' THEN -valor ELSE valor END), 0)
            FROM movimentos_caixa
            WHERE empresa_id = :empresaId AND sessao_caixa_id = :sessaoId
            """, nativeQuery = true)
    BigDecimal esperado(@Param("empresaId") Long empresaId, @Param("sessaoId") Long sessaoId);
}
