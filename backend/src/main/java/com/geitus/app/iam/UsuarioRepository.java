package com.geitus.app.iam;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Acesso a dados da entidade {@link Usuario}.
 *
 * <p>As consultas de gestao isolam por {@code empresaId}, para que um usuario de
 * outra empresa nunca seja encontrado (DEC-016). A notacao {@code Empresa_Id}
 * navega ate a propriedade {@code id} de {@code Empresa} (Usuario nao tem um
 * atributo direto {@code empresaId}), no mesmo padrao do {@code ProdutoRepository}.
 */
public interface UsuarioRepository extends JpaRepository<Usuario, Long> {

    Optional<Usuario> findByEmail(String email);

    boolean existsByEmail(String email);

    Optional<Usuario> findByIdAndEmpresa_Id(Long id, Long empresaId);

    /**
     * Conta os usuarios ativos com um dado perfil na empresa. Usado na
     * autoprotecao do ultimo ADMIN ativo.
     */
    long countByEmpresa_IdAndPerfilAndAtivoTrue(Long empresaId, String perfil);

    // Nota (mesma licao do ProdutoRepository): a listagem com filtros usa duas
    // queries em vez de uma unica com ":busca IS NULL OR LOWER(CONCAT(...))".
    // Quando :busca era null, o PostgreSQL inferia o parametro dentro de
    // LOWER(CONCAT(...)) como bytea e a query falhava em runtime com
    // "function lower(bytea) does not exist". Separar os casos garante que
    // :busca nunca seja null na query que o utiliza. Os filtros :ativo e
    // :perfil sao comparacoes simples (sem LOWER/CONCAT) e podem ser nulos.

    /**
     * Lista usuarios da empresa, com filtros opcionais de status ({@code ativo})
     * e {@code perfil} (ambos ignorados quando {@code null}).
     */
    @Query("""
            SELECT u FROM Usuario u
            WHERE u.empresa.id = :empresaId
              AND (:ativo IS NULL OR u.ativo = :ativo)
              AND (:perfil IS NULL OR u.perfil = :perfil)
            ORDER BY u.nome
            """)
    List<Usuario> buscarPorEmpresa(@Param("empresaId") Long empresaId, @Param("ativo") Boolean ativo,
            @Param("perfil") String perfil);

    /**
     * Lista usuarios da empresa cujo nome ou e-mail contenha o termo de busca
     * (sem diferenciar maiusculas/minusculas), com filtros opcionais de status e
     * perfil. {@code busca} NUNCA deve ser {@code null} aqui; o service usa
     * {@link #buscarPorEmpresa} quando nao ha termo de busca.
     */
    @Query("""
            SELECT u FROM Usuario u
            WHERE u.empresa.id = :empresaId
              AND (LOWER(u.nome) LIKE LOWER(CONCAT('%', :busca, '%'))
                   OR LOWER(u.email) LIKE LOWER(CONCAT('%', :busca, '%')))
              AND (:ativo IS NULL OR u.ativo = :ativo)
              AND (:perfil IS NULL OR u.perfil = :perfil)
            ORDER BY u.nome
            """)
    List<Usuario> buscarPorEmpresaComBusca(@Param("empresaId") Long empresaId, @Param("busca") String busca,
            @Param("ativo") Boolean ativo, @Param("perfil") String perfil);
}
