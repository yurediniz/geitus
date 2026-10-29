package com.geitus.app.sales.venda;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

/**
 * Acesso as vendas, aos itens e aos pagamentos, sempre filtrado pela empresa
 * (DEC-016). So insercao, leitura e o cancelamento: o banco recusa o resto.
 */
interface VendaRepository extends Repository<Venda, Long> {

    Venda saveAndFlush(Venda venda);

    /**
     * Confere ja as constraints deferidas da V17 (venda coerente e
     * cancelamento coerente), que senao so rodariam no commit: uma violacao
     * sai neste comando como violacao de integridade (409 generico), e nao
     * como erro no commit (500). Vale ate o fim da transacao. Exige transacao.
     */
    @Modifying
    @Query(value = "SET CONSTRAINTS ALL IMMEDIATE", nativeQuery = true)
    void conferirConstraintsAgora();

    Optional<Venda> findByEmpresaIdAndChaveIdempotencia(Long empresaId, UUID chave);

    Optional<Venda> findByEmpresaIdAndUuid(Long empresaId, UUID uuid);

    /** A venda pelo numero (a busca da devolucao, de qualquer sessao e data). */
    Optional<Venda> findByEmpresaIdAndNumero(Long empresaId, Long numero);

    Optional<Venda> findByEmpresaIdAndId(Long empresaId, Long id);

    /** Ids internos, sessao e vendedor, sem carregar a entidade (o cancelamento trava a sessao antes). */
    record Referencia(Long id, Long sessaoId, Long vendedorId) {
    }

    @Query("""
            SELECT new com.geitus.app.sales.venda.VendaRepository$Referencia(v.id, v.sessaoCaixaId, v.usuarioId)
              FROM Venda v
             WHERE v.empresaId = :empresaId AND v.uuid = :uuid
            """)
    Optional<Referencia> referencia(@Param("empresaId") Long empresaId, @Param("uuid") UUID uuid);

    /** A venda com a linha travada ({@code FOR UPDATE}), carregada pela primeira vez na transacao. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT v FROM Venda v WHERE v.empresaId = :empresaId AND v.id = :id")
    Optional<Venda> travarPorId(@Param("empresaId") Long empresaId, @Param("id") Long id);

    /** Numero de cada venda (lista de movimentos do caixa). */
    record NumeroDaVenda(Long id, Long numero) {
    }

    @Query("""
            SELECT new com.geitus.app.sales.venda.VendaRepository$NumeroDaVenda(v.id, v.numero)
              FROM Venda v
             WHERE v.empresaId = :empresaId AND v.id IN :ids
            """)
    List<NumeroDaVenda> numeros(@Param("empresaId") Long empresaId, @Param("ids") Collection<Long> ids);
}
