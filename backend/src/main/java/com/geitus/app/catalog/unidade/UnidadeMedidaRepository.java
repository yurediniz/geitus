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
 * {@code produtos.unidade_id} (V6) e {@code produto_embalagens.unidade_id}
 * (V12, que substituiu a unidade de compra), sem depender do mapeamento de
 * {@code Produto}; sao exercidas contra Postgres real no
 * {@code CatalogoRepositoryIT}.
 */
public interface UnidadeMedidaRepository extends JpaRepository<UnidadeMedida, Long> {

    Optional<UnidadeMedida> findByUuidAndEmpresa_Id(UUID uuid, Long empresaId);

    boolean existsBySiglaAndEmpresa_Id(String sigla, Long empresaId);

    boolean existsBySiglaAndEmpresa_IdAndIdNot(String sigla, Long empresaId, Long id);

    List<UnidadeMedida> findByEmpresa_IdOrderBySigla(Long empresaId);

    List<UnidadeMedida> findByEmpresa_IdAndAtivoOrderBySigla(Long empresaId, boolean ativo);

    /**
     * Quantidade de produtos que usam a unidade como unidade de venda OU numa
     * embalagem (um produto que a usa nas duas, ou em varias embalagens, conta
     * uma vez). Bloqueia a exclusao.
     */
    @Query(value = """
            SELECT count(*) FROM (
                SELECT p.id FROM produtos p WHERE p.unidade_id = :unidadeId
                UNION
                SELECT e.produto_id FROM produto_embalagens e WHERE e.unidade_id = :unidadeId
            ) uso
            """, nativeQuery = true)
    long contarProdutosQueUsam(@Param("unidadeId") Long unidadeId);

    /**
     * Uso de cada unidade da empresa numa unica consulta (evita N+1 na
     * listagem). Cada linha: {@code [id da unidade, quantidade de produtos]};
     * unidades sem uso nao aparecem. Mesma regra de
     * {@link #contarProdutosQueUsam}: venda ou embalagem, produto contado uma
     * vez ({@code count(DISTINCT)}). As FKs compostas garantem que a unidade de
     * cada linha e da mesma empresa.
     */
    @Query(value = """
            SELECT uso.unidade_id, count(DISTINCT uso.produto_id)
              FROM (SELECT p.unidade_id, p.id AS produto_id
                      FROM produtos p
                     WHERE p.empresa_id = :empresaId
                    UNION ALL
                    SELECT e.unidade_id, e.produto_id
                      FROM produto_embalagens e
                     WHERE e.empresa_id = :empresaId) uso
             GROUP BY uso.unidade_id
            """, nativeQuery = true)
    List<Object[]> contarUsoPorUnidade(@Param("empresaId") Long empresaId);

    /**
     * Fase B3: se algum produto com esta unidade de venda tem embalagem com
     * quantidade fracionada (ex.: SC c/ 25,5 KG). Impede desligar o
     * fracionamento da unidade, que deixaria a embalagem invalida.
     */
    @Query(value = """
            SELECT EXISTS (
                SELECT 1 FROM produto_embalagens e
                  JOIN produtos p ON p.empresa_id = e.empresa_id AND p.id = e.produto_id
                 WHERE p.empresa_id = :empresaId
                   AND p.unidade_id = :unidadeId
                   AND e.quantidade <> trunc(e.quantidade))
            """, nativeQuery = true)
    boolean existeEmbalagemFracionadaDaUnidadeDeVenda(@Param("empresaId") Long empresaId,
            @Param("unidadeId") Long unidadeId);
}
