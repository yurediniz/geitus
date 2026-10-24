package com.geitus.app.cashier.ponto;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

/**
 * Acesso aos pontos de caixa, sempre filtrado pela empresa (DEC-016). Estende
 * {@link Repository} e declara so o que o modulo usa: sem {@code delete*} nem
 * {@code findById} sem empresa (DT-024).
 */
public interface PontoDeCaixaRepository extends Repository<PontoDeCaixa, Long> {

    PontoDeCaixa saveAndFlush(PontoDeCaixa ponto);

    boolean existsByEmpresaId(Long empresaId);

    long countByEmpresaId(Long empresaId);

    Optional<PontoDeCaixa> findByEmpresaIdAndUuid(Long empresaId, UUID uuid);

    /**
     * O ponto com a linha travada ({@code SELECT ... FOR UPDATE}): poe em fila
     * a abertura de caixa, a inativacao e a edicao do mesmo ponto.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM PontoDeCaixa p WHERE p.empresaId = :empresaId AND p.uuid = :uuid")
    Optional<PontoDeCaixa> travarPorUuid(@Param("empresaId") Long empresaId, @Param("uuid") UUID uuid);

    /** Pontos da empresa na ordem de criacao; {@code ativo} nulo traz todos. */
    @Query("""
            SELECT p FROM PontoDeCaixa p
            WHERE p.empresaId = :empresaId AND (:ativo IS NULL OR p.ativo = :ativo)
            ORDER BY p.id
            """)
    List<PontoDeCaixa> listar(@Param("empresaId") Long empresaId, @Param("ativo") Boolean ativo);

    /** Ponto da empresa com o mesmo nome, sem diferenciar maiusculas (a regra de {@code uq_ponto_caixa_nome}). */
    @Query("SELECT p FROM PontoDeCaixa p WHERE p.empresaId = :empresaId AND lower(p.nome) = lower(:nome)")
    Optional<PontoDeCaixa> buscarPorNome(@Param("empresaId") Long empresaId, @Param("nome") String nome);
}
