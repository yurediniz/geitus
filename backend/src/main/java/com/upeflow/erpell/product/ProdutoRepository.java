package com.upeflow.erpell.product;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

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
}
