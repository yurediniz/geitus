package com.geitus.app.catalog;

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

    // Nota: Produto nao possui um atributo direto "empresaId" (apenas o
    // relacionamento "empresa" com Empresa e o getter derivado
    // Produto.getEmpresaId()). Por isso os metodos abaixo usam a notacao
    // "Empresa_Id" para navegar explicitamente ate a propriedade "id" de
    // Empresa; sem o underscore, o Spring Data tenta resolver "empresaId"
    // como um unico atributo da entidade e falha na inicializacao do
    // contexto ("Could not resolve attribute 'empresaId' of ... Produto").

    Optional<Produto> findByIdAndEmpresa_Id(Long id, Long empresaId);

    boolean existsBySkuAndEmpresa_Id(String sku, Long empresaId);

    boolean existsBySkuAndEmpresa_IdAndIdNot(String sku, Long empresaId, Long id);

    boolean existsByCodigoBarrasAndEmpresa_Id(String codigoBarras, Long empresaId);

    boolean existsByCodigoBarrasAndEmpresa_IdAndIdNot(String codigoBarras, Long empresaId, Long id);

    // Nota: a listagem com filtros usa duas queries em vez de uma unica com
    // ":busca IS NULL OR ...": quando :busca era null, o PostgreSQL inferia o
    // parametro dentro de LOWER(CONCAT(...)) como bytea e a query falhava em
    // runtime com "function lower(bytea) does not exist". Separar os casos
    // garante que :busca nunca seja null na query que o utiliza.

    /**
     * Lista produtos da empresa, com filtro opcional de status ativo/inativo
     * ({@code ativo} e ignorado quando {@code null}).
     */
    @Query("""
            SELECT p FROM Produto p
            WHERE p.empresa.id = :empresaId
              AND (:ativo IS NULL OR p.ativo = :ativo)
            ORDER BY p.nome
            """)
    List<Produto> buscarPorEmpresa(@Param("empresaId") Long empresaId, @Param("ativo") Boolean ativo);

    /**
     * Lista produtos da empresa cujo nome, SKU ou codigo de barras contenha o
     * termo de busca (sem diferenciar maiusculas/minusculas), com filtro
     * opcional de status. {@code busca} NUNCA deve ser {@code null} aqui; o
     * service usa {@link #buscarPorEmpresa} quando nao ha termo de busca.
     */
    @Query("""
            SELECT p FROM Produto p
            WHERE p.empresa.id = :empresaId
              AND (LOWER(p.nome) LIKE LOWER(CONCAT('%', :busca, '%'))
                   OR LOWER(p.sku) LIKE LOWER(CONCAT('%', :busca, '%'))
                   OR LOWER(p.codigoBarras) LIKE LOWER(CONCAT('%', :busca, '%')))
              AND (:ativo IS NULL OR p.ativo = :ativo)
            ORDER BY p.nome
            """)
    List<Produto> buscarPorEmpresaComBusca(@Param("empresaId") Long empresaId, @Param("busca") String busca,
            @Param("ativo") Boolean ativo);
}
