package com.geitus.app.customer;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Acesso a dados da entidade {@link Cliente}.
 *
 * <p>Todas as consultas isolam por {@code empresaId}, para que um cliente de
 * outra empresa nunca seja encontrado (DEC-016). A busca por identificador usa
 * o {@code uuid} publico; o {@code id} interno nao chega da API.
 */
public interface ClienteRepository extends JpaRepository<Cliente, Long> {

    // Nota: Cliente nao possui um atributo direto "empresaId" (apenas o
    // relacionamento "empresa"). A notacao "Empresa_Id" navega ate a
    // propriedade "id" de Empresa; sem o underscore o Spring Data tenta
    // resolver "empresaId" como atributo unico e falha na inicializacao
    // (mesma situacao do ProdutoRepository).

    Optional<Cliente> findByUuidAndEmpresa_Id(UUID uuid, Long empresaId);

    boolean existsByCpfAndEmpresa_Id(String cpf, Long empresaId);

    boolean existsByCpfAndEmpresa_IdAndIdNot(String cpf, Long empresaId, Long id);

    // Nota: tres queries em vez de uma unica com ":busca IS NULL OR ...". Um
    // parametro null dentro de LOWER/LIKE faz o PostgreSQL inferi-lo como bytea
    // ("function lower(bytea) does not exist" — bug ja visto no
    // ProdutoRepository). Por isso os padroes NUNCA sao null aqui: o service
    // escolhe a query conforme o termo e entrega os padroes PRONTOS — em
    // minusculas, com '%', '_' e '\' escapados por '\' e com '%' nas pontas.
    // Exemplo: termo "100%" vira o padrao "%100\%%".

    /**
     * Lista os clientes da empresa ordenados por nome, com filtro opcional de
     * status ({@code ativo} e ignorado quando {@code null}).
     */
    @Query("""
            SELECT c FROM Cliente c
            WHERE c.empresa.id = :empresaId
              AND (:ativo IS NULL OR c.ativo = :ativo)
            ORDER BY c.nome
            """)
    List<Cliente> buscarPorEmpresa(@Param("empresaId") Long empresaId, @Param("ativo") Boolean ativo);

    /**
     * Lista os clientes cujo nome casa com {@code padraoNome} (sem diferenciar
     * maiusculas/minusculas). Usada quando o termo nao tem digitos.
     */
    @Query("""
            SELECT c FROM Cliente c
            WHERE c.empresa.id = :empresaId
              AND LOWER(c.nome) LIKE :padraoNome ESCAPE '\\'
              AND (:ativo IS NULL OR c.ativo = :ativo)
            ORDER BY c.nome
            """)
    List<Cliente> buscarPorNome(@Param("empresaId") Long empresaId, @Param("padraoNome") String padraoNome,
            @Param("ativo") Boolean ativo);

    /**
     * Lista os clientes cujo nome casa com {@code padraoNome} ou cujo CPF,
     * telefone ou WhatsApp proprio casa com {@code padraoDigitos} (o termo
     * reduzido a digitos, para encontrar numeros digitados com mascara).
     */
    @Query("""
            SELECT c FROM Cliente c
            WHERE c.empresa.id = :empresaId
              AND (LOWER(c.nome) LIKE :padraoNome ESCAPE '\\'
                   OR c.cpf LIKE :padraoDigitos ESCAPE '\\'
                   OR c.telefone LIKE :padraoDigitos ESCAPE '\\'
                   OR c.whatsapp LIKE :padraoDigitos ESCAPE '\\')
              AND (:ativo IS NULL OR c.ativo = :ativo)
            ORDER BY c.nome
            """)
    List<Cliente> buscarPorNomeOuDigitos(@Param("empresaId") Long empresaId,
            @Param("padraoNome") String padraoNome, @Param("padraoDigitos") String padraoDigitos,
            @Param("ativo") Boolean ativo);
}
