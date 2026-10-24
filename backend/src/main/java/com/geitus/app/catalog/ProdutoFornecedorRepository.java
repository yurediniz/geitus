package com.geitus.app.catalog;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Acesso a ligacao produto x fornecedor ({@link ProdutoFornecedor}, V14).
 * Toda consulta filtra pela empresa (DEC-016).
 */
public interface ProdutoFornecedorRepository extends JpaRepository<ProdutoFornecedor, ProdutoFornecedor.Chave> {

    @Query("""
            SELECT count(pf) FROM ProdutoFornecedor pf
            WHERE pf.chave.empresaId = :empresaId AND pf.chave.fornecedorId = :fornecedorId
            """)
    long contar(@Param("empresaId") Long empresaId, @Param("fornecedorId") Long fornecedorId);

    /** Cada linha: {@code [id do fornecedor, quantidade de produtos]}. */
    @Query("""
            SELECT pf.chave.fornecedorId, count(pf) FROM ProdutoFornecedor pf
            WHERE pf.chave.empresaId = :empresaId AND pf.chave.fornecedorId IN :fornecedorIds
            GROUP BY pf.chave.fornecedorId
            """)
    List<Object[]> contarPorFornecedor(@Param("empresaId") Long empresaId,
            @Param("fornecedorIds") Collection<Long> fornecedorIds);
}
