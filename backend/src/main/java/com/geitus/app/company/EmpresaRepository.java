package com.geitus.app.company;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

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
}
