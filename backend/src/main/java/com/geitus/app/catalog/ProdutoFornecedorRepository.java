package com.geitus.app.catalog;

import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.geitus.app.catalog.dto.ProdutoDoFornecedorResponse;

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

    /**
     * Produtos ligados ao fornecedor, por nome (desempate pelo id), com o
     * aviso de que ele e o da ultima compra. O {@code pageable} nao deve trazer
     * ordenacao: a ordem e a da consulta.
     */
    @Query(value = """
            SELECT new com.geitus.app.catalog.dto.ProdutoDoFornecedorResponse(
                       p.uuid, p.numero, p.nome, p.codigo, p.sku, p.ativo,
                       CASE WHEN p.fornecedorUltimaCompraId = pf.chave.fornecedorId THEN true ELSE false END)
              FROM ProdutoFornecedor pf
              JOIN pf.produto p
             WHERE pf.chave.empresaId = :empresaId
               AND pf.chave.fornecedorId = :fornecedorId
             ORDER BY p.nomeNormalizado, p.id
            """,
            countQuery = """
            SELECT count(pf) FROM ProdutoFornecedor pf
             WHERE pf.chave.empresaId = :empresaId
               AND pf.chave.fornecedorId = :fornecedorId
            """)
    Page<ProdutoDoFornecedorResponse> produtosDoFornecedor(@Param("empresaId") Long empresaId,
            @Param("fornecedorId") Long fornecedorId, Pageable pageable);
}
