package com.geitus.app.catalog.balanca;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Acesso a configuracao da etiqueta de balanca, sempre pela empresa do
 * usuario autenticado (DEC-016). Ver a nota sobre {@code Empresa_Id} no
 * {@code ProdutoRepository}.
 */
public interface ConfiguracaoEtiquetaRepository extends JpaRepository<ConfiguracaoEtiquetaBalanca, Long> {

    Optional<ConfiguracaoEtiquetaBalanca> findByEmpresa_Id(Long empresaId);
}
