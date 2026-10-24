package com.geitus.app.catalog.marca;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Acesso a dados da entidade {@link Marca}. As consultas isolam por empresa
 * (DEC-016) e a busca por identificador usa o {@code uuid} publico.
 */
public interface MarcaRepository extends JpaRepository<Marca, Long> {
}
