package com.geitus.app.inventory;

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
     * Concorrencia (spec 4.5): dois primeiros movimentos simultaneos tentam
     * inserir; um insere e o outro espera e nao faz nada (sem erro de
     * unicidade). Em seguida os dois travam a mesma linha com
     * {@link #buscarParaAtualizar}.
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
}
