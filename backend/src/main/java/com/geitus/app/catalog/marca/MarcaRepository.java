package com.geitus.app.catalog.marca;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Acesso a dados da entidade {@link Marca}.
 *
 * <p>As consultas isolam por empresa (DEC-016); a busca por identificador usa
 * o {@code uuid} publico. "Empresa_Id"/"Pai_Id" navegam ate o id da relacao.
 *
 * <p><b>Contagens em SQL nativo:</b> leem direto {@code produtos.marca_id} e
 * {@code fornecedor_marcas.marca_id} (V14), sem depender do mapeamento de
 * {@code Produto} nem do pacote {@code supplier} (o catalogo nao depende dele).
 * Exercidas contra Postgres real no {@code MarcaIT}.
 */
public interface MarcaRepository extends JpaRepository<Marca, Long> {

    Optional<Marca> findByUuidAndEmpresa_Id(UUID uuid, Long empresaId);

    /** Todas as marcas da empresa (a arvore e montada em memoria). */
    List<Marca> findByEmpresa_Id(Long empresaId);

    /** Submarcas diretas (ativas ou nao). */
    long countByPai_Id(Long paiId);

    /** Produtos (ativos ou nao) vinculados diretamente a marca. */
    @Query(value = "SELECT count(*) FROM produtos p WHERE p.marca_id = :marcaId", nativeQuery = true)
    long contarProdutos(@Param("marcaId") Long marcaId);

    /**
     * Produtos por marca da empresa numa unica consulta. Cada linha:
     * {@code [id da marca, quantidade]}; marcas sem produto nao aparecem.
     */
    @Query(value = """
            SELECT p.marca_id, count(*)
              FROM produtos p
             WHERE p.empresa_id = :empresaId
               AND p.marca_id IS NOT NULL
             GROUP BY p.marca_id
            """, nativeQuery = true)
    List<Object[]> contarProdutosPorMarca(@Param("empresaId") Long empresaId);

    /** Fornecedores ligados diretamente a marca (ativos ou nao). */
    @Query(value = "SELECT count(*) FROM fornecedor_marcas fm WHERE fm.marca_id = :marcaId", nativeQuery = true)
    long contarFornecedores(@Param("marcaId") Long marcaId);

    /**
     * Fornecedores por marca da empresa numa unica consulta. Cada linha:
     * {@code [id da marca, quantidade]}; marcas sem fornecedor nao aparecem.
     */
    @Query(value = """
            SELECT fm.marca_id, count(*)
              FROM fornecedor_marcas fm
             WHERE fm.empresa_id = :empresaId
             GROUP BY fm.marca_id
            """, nativeQuery = true)
    List<Object[]> contarFornecedoresPorMarca(@Param("empresaId") Long empresaId);

    /** Marcas da empresa com os ids internos informados (as de outra empresa ficam de fora). */
    List<Marca> findByEmpresa_IdAndIdIn(Long empresaId, Collection<Long> ids);
}
