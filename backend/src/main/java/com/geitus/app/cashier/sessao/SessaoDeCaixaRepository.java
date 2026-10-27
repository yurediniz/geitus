package com.geitus.app.cashier.sessao;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

/**
 * Acesso as sessoes de caixa, sempre filtrado pela empresa (DEC-016). So o
 * que o modulo usa: sem {@code delete*} nem {@code findById} sem empresa
 * (DT-024); o banco tambem recusa excluir sessao.
 */
public interface SessaoDeCaixaRepository extends Repository<SessaoDeCaixa, Long> {

    SessaoDeCaixa saveAndFlush(SessaoDeCaixa sessao);

    Optional<SessaoDeCaixa> findByEmpresaIdAndUuid(Long empresaId, UUID uuid);

    Optional<SessaoDeCaixa> findByEmpresaIdAndId(Long empresaId, Long id);

    /**
     * A sessao com a linha travada ({@code SELECT ... FOR UPDATE}): lancamentos,
     * contagem e fechamento da mesma sessao ficam em fila, e o esperado lido
     * depois da trava nao muda ate o fim da transacao (spec do Caixa).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SessaoDeCaixa s WHERE s.empresaId = :empresaId AND s.uuid = :uuid")
    Optional<SessaoDeCaixa> travarPorUuid(@Param("empresaId") Long empresaId, @Param("uuid") UUID uuid);

    /** A sessao travada pelo id interno (cancelamento de venda; docs/modules/pdv.md). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SessaoDeCaixa s WHERE s.empresaId = :empresaId AND s.id = :id")
    Optional<SessaoDeCaixa> travarPorId(@Param("empresaId") Long empresaId, @Param("id") Long id);

    /**
     * A sessao ABERTA ou EM_CONFERENCIA do usuario com a linha travada: a venda
     * e o fechamento da mesma sessao ficam em fila. Se um fechamento confirmar
     * antes, o PostgreSQL reavalia o filtro depois da espera e a sessao fechada
     * nao volta (docs/modules/pdv.md; DT-039).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT s FROM SessaoDeCaixa s
            WHERE s.empresaId = :empresaId AND s.abertaPor = :usuarioId
              AND s.status IN (com.geitus.app.cashier.sessao.StatusDaSessao.ABERTA,
                               com.geitus.app.cashier.sessao.StatusDaSessao.EM_CONFERENCIA)
            """)
    Optional<SessaoDeCaixa> travarEmAndamentoDoUsuario(@Param("empresaId") Long empresaId,
            @Param("usuarioId") Long usuarioId);

    /** As sessoes da empresa com estes ids, ja com o ponto (lista de vendas do PDV). */
    @Query("SELECT s FROM SessaoDeCaixa s JOIN FETCH s.ponto WHERE s.empresaId = :empresaId AND s.id IN :ids")
    List<SessaoDeCaixa> comPontoPorIds(@Param("empresaId") Long empresaId, @Param("ids") Collection<Long> ids);

    /** A sessao ABERTA ou EM_CONFERENCIA aberta pelo usuario (no maximo uma; o mesmo predicado do indice parcial da V16). */
    @Query("""
            SELECT s FROM SessaoDeCaixa s
            WHERE s.empresaId = :empresaId AND s.abertaPor = :usuarioId
              AND s.status IN (com.geitus.app.cashier.sessao.StatusDaSessao.ABERTA,
                               com.geitus.app.cashier.sessao.StatusDaSessao.EM_CONFERENCIA)
            """)
    Optional<SessaoDeCaixa> emAndamentoDoUsuario(@Param("empresaId") Long empresaId,
            @Param("usuarioId") Long usuarioId);

    /** A sessao ABERTA ou EM_CONFERENCIA do ponto (no maximo uma; o mesmo predicado do indice parcial da V16). */
    @Query("""
            SELECT s FROM SessaoDeCaixa s
            WHERE s.empresaId = :empresaId AND s.ponto.id = :pontoId
              AND s.status IN (com.geitus.app.cashier.sessao.StatusDaSessao.ABERTA,
                               com.geitus.app.cashier.sessao.StatusDaSessao.EM_CONFERENCIA)
            """)
    Optional<SessaoDeCaixa> emAndamentoDoPonto(@Param("empresaId") Long empresaId, @Param("pontoId") Long pontoId);
}
