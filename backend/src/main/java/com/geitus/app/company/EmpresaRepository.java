package com.geitus.app.company;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

/**
 * Acesso a dados da entidade {@link Empresa}.
 */
public interface EmpresaRepository extends JpaRepository<Empresa, Long> {

    Optional<Empresa> findByNome(String nome);

    /**
     * Indica se ja existe OUTRA empresa (id diferente) com o mesmo CNPJ. Usado
     * para garantir a unicidade do CNPJ (constraint {@code uq_empresa_cnpj})
     * antes de salvar, devolvendo um 409 amigavel em vez de erro de banco.
     */
    boolean existsByCnpjAndIdNot(String cnpj, Long id);

    /**
     * Carrega a empresa com bloqueio pessimista de escrita na linha (no
     * PostgreSQL, {@code SELECT ... FOR NO KEY UPDATE}/{@code FOR UPDATE}),
     * mantido ate o fim da transacao corrente. Serve de "trava por empresa"
     * para serializar escritas que dependem de ler um conjunto de linhas e
     * decidir sobre ele (ex.: mover categoria checando ciclo na arvore).
     * Exige transacao ativa.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM Empresa e WHERE e.id = :id")
    Optional<Empresa> travarPorId(@Param("id") Long id);
}
