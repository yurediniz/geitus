package com.geitus.app.sales.venda;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Acesso as devolucoes e aos itens delas, sempre filtrado pela empresa
 * (DEC-016). So insercao e leitura: o banco recusa alterar e apagar.
 */
interface DevolucaoRepository extends Repository<Devolucao, Long> {

    Devolucao saveAndFlush(Devolucao devolucao);

    Optional<Devolucao> findByEmpresaIdAndChaveIdempotencia(Long empresaId, UUID chave);

    /** As devolucoes da venda, da mais antiga. */
    List<Devolucao> findByEmpresaIdAndVendaIdOrderByCriadaEmAscIdAsc(Long empresaId, Long vendaId);

    boolean existsByEmpresaIdAndVendaId(Long empresaId, Long vendaId);

    /** Destas vendas, as que tem devolucao (o {@code podeCancelar} da lista), numa consulta. */
    @Query("""
            SELECT DISTINCT d.vendaId
              FROM Devolucao d
             WHERE d.empresaId = :empresaId AND d.vendaId IN :vendaIds
            """)
    List<Long> vendasComDevolucao(@Param("empresaId") Long empresaId, @Param("vendaIds") Collection<Long> vendaIds);
}
