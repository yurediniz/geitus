package com.geitus.app.catalog.unidade;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Acesso a dados da entidade {@link UnidadeMedida}.
 *
 * <p>As consultas isolam por empresa (DEC-016); a busca por identificador usa
 * o {@code uuid} publico. "Empresa_Id" navega ate o id da empresa (mesma nota
 * do {@code ClienteRepository}).
 *
 * <p><b>Contagens de uso em SQL nativo:</b> leem direto as colunas
 * {@code produtos.unidade_id} e {@code produtos.unidade_compra_id} (V6), sem
 * depender do mapeamento de {@code Produto}; poderiam virar JPQL, mas sao
 * simples e ja exercidas contra Postgres real no {@code CatalogoRepositoryIT}.
 */
public interface UnidadeMedidaRepository extends JpaRepository<UnidadeMedida, Long> {

    Optional<UnidadeMedida> findByUuidAndEmpresa_Id(UUID uuid, Long empresaId);

    boolean existsBySiglaAndEmpresa_Id(String sigla, Long empresaId);

    boolean existsBySiglaAndEmpresa_IdAndIdNot(String sigla, Long empresaId, Long id);

    List<UnidadeMedida> findByEmpresa_IdOrderBySigla(Long empresaId);

    List<UnidadeMedida> findByEmpresa_IdAndAtivoOrderBySigla(Long empresaId, boolean ativo);

    /**
     * Quantidade de produtos que usam a unidade como unidade de venda OU de
     * compra (um produto que a usa nas duas conta uma vez). Bloqueia a exclusao.
     */
    @Query(value = """
            SELECT count(*) FROM produtos p
             WHERE p.unidade_id = :unidadeId
                OR p.unidade_compra_id = :unidadeId
            """, nativeQuery = true)
    long contarProdutosQueUsam(@Param("unidadeId") Long unidadeId);

    /**
     * Uso de cada unidade da empresa numa unica consulta (evita N+1 na
     * listagem). Cada linha: {@code [id da unidade, quantidade de produtos]};
     * unidades sem uso nao aparecem. Mesma regra de
     * {@link #contarProdutosQueUsam}: venda ou compra, produto contado uma vez.
     */
    @Query(value = """
            SELECT u.id, count(DISTINCT p.id)
              FROM unidades_medida u
              JOIN produtos p ON p.unidade_id = u.id OR p.unidade_compra_id = u.id
             WHERE u.empresa_id = :empresaId
             GROUP BY u.id
            """, nativeQuery = true)
    List<Object[]> contarUsoPorUnidade(@Param("empresaId") Long empresaId);
}
