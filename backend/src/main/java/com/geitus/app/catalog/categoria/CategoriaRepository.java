package com.geitus.app.catalog.categoria;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Acesso a dados da entidade {@link Categoria}.
 *
 * <p>As consultas isolam por empresa (DEC-016); a busca por identificador usa
 * o {@code uuid} publico. "Empresa_Id"/"Pai_Id" navegam ate o id da relacao.
 *
 * <p><b>Contagens de produtos em SQL nativo:</b> leem direto
 * {@code produtos.categoria_id} (V6), sem depender do mapeamento de
 * {@code Produto}; poderiam virar JPQL, mas sao simples e ja exercidas contra
 * Postgres real no {@code CatalogoRepositoryIT}.
 */
public interface CategoriaRepository extends JpaRepository<Categoria, Long> {

    Optional<Categoria> findByUuidAndEmpresa_Id(UUID uuid, Long empresaId);

    /** Todas as categorias da empresa (a arvore e montada em memoria). */
    List<Categoria> findByEmpresa_Id(Long empresaId);

    /** Subcategorias diretas (ativas ou nao). */
    long countByPai_Id(Long paiId);

    /** Produtos (ativos ou nao) vinculados diretamente a categoria. */
    @Query(value = "SELECT count(*) FROM produtos p WHERE p.categoria_id = :categoriaId", nativeQuery = true)
    long contarProdutos(@Param("categoriaId") Long categoriaId);

    /**
     * Produtos por categoria da empresa numa unica consulta. Cada linha:
     * {@code [id da categoria, quantidade]}; categorias sem produto nao aparecem.
     */
    @Query(value = """
            SELECT p.categoria_id, count(*)
              FROM produtos p
             WHERE p.empresa_id = :empresaId
               AND p.categoria_id IS NOT NULL
             GROUP BY p.categoria_id
            """, nativeQuery = true)
    List<Object[]> contarProdutosPorCategoria(@Param("empresaId") Long empresaId);
}
