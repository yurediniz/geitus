package com.upeflow.erpell.product;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Acesso a dados da entidade {@link Produto}.
 *
 * <p>Todas as consultas por identificador isolam por {@code empresaId}, para
 * que um produto de outra empresa nunca seja encontrado (DEC-016).
 */
public interface ProdutoRepository extends JpaRepository<Produto, Long> {

    List<Produto> findByEmpresaId(Long empresaId);

    Optional<Produto> findByIdAndEmpresaId(Long id, Long empresaId);

    boolean existsBySkuAndEmpresaId(String sku, Long empresaId);

    boolean existsBySkuAndEmpresaIdAndIdNot(String sku, Long empresaId, Long id);

    boolean existsByCodigoBarrasAndEmpresaId(String codigoBarras, Long empresaId);

    boolean existsByCodigoBarrasAndEmpresaIdAndIdNot(String codigoBarras, Long empresaId, Long id);

    /**
     * Lista produtos da empresa com filtros opcionais de busca (nome, SKU ou
     * codigo de barras contendo o termo, sem diferenciar maiusculas/minusculas)
     * e status ativo/inativo. Os parametros {@code busca} e {@code ativo} sao
     * ignorados quando {@code null}.
     */
    @Query("""
            SELECT p FROM Produto p
            WHERE p.empresa.id = :empresaId
              AND (:busca IS NULL
                   OR LOWER(p.nome) LIKE LOWER(CONCAT('%', :busca, '%'))
                   OR LOWER(p.sku) LIKE LOWER(CONCAT('%', :busca, '%'))
                   OR LOWER(p.codigoBarras) LIKE LOWER(CONCAT('%', :busca, '%')))
              AND (:ativo IS NULL OR p.ativo = :ativo)
            ORDER BY p.nome
            """)
    List<Produto> buscarPorEmpresaComFiltros(@Param("empresaId") Long empresaId, @Param("busca") String busca,
            @Param("ativo") Boolean ativo);
}
