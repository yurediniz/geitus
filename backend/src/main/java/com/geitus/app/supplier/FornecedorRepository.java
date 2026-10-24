package com.geitus.app.supplier;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Acesso a dados da entidade {@link Fornecedor}. Toda consulta filtra pela
 * empresa (DEC-016); a busca por identificador usa o {@code uuid} publico.
 * "Empresa_Id" navega ate o id da relacao (como no {@code ClienteRepository}).
 */
public interface FornecedorRepository extends JpaRepository<Fornecedor, Long> {

    Optional<Fornecedor> findByUuidAndEmpresa_Id(UUID uuid, Long empresaId);

    /**
     * Razao social do fornecedor da empresa que ja tem este documento,
     * ignorando {@code ignorarId} (o proprio fornecedor na edicao; {@code null}
     * no cadastro). O indice unico parcial da V14 garante no maximo um.
     */
    @Query("""
            SELECT f.razaoSocial FROM Fornecedor f
            WHERE f.empresa.id = :empresaId
              AND f.documento = :documento
              AND (:ignorarId IS NULL OR f.id <> :ignorarId)
            """)
    Optional<String> razaoSocialComDocumento(@Param("empresaId") Long empresaId,
            @Param("documento") String documento, @Param("ignorarId") Long ignorarId);

    /** Fornecedores da empresa com os ids, ja com os representantes (a listagem sem N+1). */
    @Query("""
            SELECT DISTINCT f FROM Fornecedor f
            LEFT JOIN FETCH f.representantes
            WHERE f.empresa.id = :empresaId AND f.id IN :ids
            """)
    List<Fornecedor> buscarComRepresentantesPorIds(@Param("empresaId") Long empresaId,
            @Param("ids") Collection<Long> ids);
}
