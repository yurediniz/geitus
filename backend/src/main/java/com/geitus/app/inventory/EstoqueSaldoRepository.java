package com.geitus.app.inventory;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

/**
 * Acesso aos saldos de estoque (V9). Toda consulta filtra pela empresa alem do
 * produto (DEC-016).
 */
public interface EstoqueSaldoRepository extends JpaRepository<EstoqueSaldo, Long> {

    /**
     * Cria a linha de saldo do produto com saldo 0, se ainda nao existir.
     * Concorrencia (spec 4.5): os movimentos de um produto ja chegam em fila
     * pela trava do produto; se dois primeiros movimentos chegarem juntos por
     * outro caminho, um insere e o outro espera e nao faz nada (sem erro de
     * unicidade). Em seguida a linha e travada com {@link #buscarParaAtualizar}.
     */
    @Modifying
    @Query(value = """
            INSERT INTO estoque_saldos (empresa_id, produto_id)
            VALUES (:empresaId, :produtoId)
            ON CONFLICT (empresa_id, produto_id) DO NOTHING
            """, nativeQuery = true)
    void garantirLinha(@Param("empresaId") Long empresaId, @Param("produtoId") Long produtoId);

    /**
     * Saldo do produto com trava de escrita ({@code SELECT ... FOR UPDATE}): o
     * segundo movimento espera o primeiro confirmar e le o saldo ja gravado,
     * mantendo a cadeia saldo anterior -> novo. Exige transacao.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT s FROM EstoqueSaldo s
            WHERE s.empresaId = :empresaId
              AND s.produtoId = :produtoId
            """)
    Optional<EstoqueSaldo> buscarParaAtualizar(@Param("empresaId") Long empresaId,
            @Param("produtoId") Long produtoId);

    /**
     * Saldos dos produtos da empresa, em uma consulta; produto sem linha fica
     * fora da lista (saldo 0). Os ids vao num unico parametro de array
     * ({@code = ANY}), e nao um parametro por id como no {@code IN}: a listagem
     * nao esbarra no limite de parametros do PostgreSQL.
     */
    default List<SaldoPorProduto> saldos(Long empresaId, Collection<Long> produtoIds) {
        return linhasDeSaldo(empresaId, produtoIds.toArray(Long[]::new)).stream()
                .map(linha -> new SaldoPorProduto(((Number) linha[0]).longValue(), (BigDecimal) linha[1]))
                .toList();
    }

    /** Linhas {@code [produto_id, saldo]}; use {@link #saldos}. */
    @Query(value = """
            SELECT s.produto_id, s.saldo
              FROM estoque_saldos s
             WHERE s.empresa_id = :empresaId
               AND s.produto_id = ANY(:produtoIds)
            """, nativeQuery = true)
    List<Object[]> linhasDeSaldo(@Param("empresaId") Long empresaId, @Param("produtoIds") Long[] produtoIds);

    /** Apaga a linha de saldo do produto (so na exclusao de produto com apenas o estoque inicial). */
    @Modifying
    @Query("DELETE FROM EstoqueSaldo s WHERE s.empresaId = :empresaId AND s.produtoId = :produtoId")
    int apagarDoProduto(@Param("empresaId") Long empresaId, @Param("produtoId") Long produtoId);
}
