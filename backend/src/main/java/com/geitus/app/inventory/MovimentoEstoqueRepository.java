package com.geitus.app.inventory;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Acesso aos movimentos de estoque (tabela so de insercao, V9). Toda consulta
 * filtra pela empresa (DEC-016).
 */
public interface MovimentoEstoqueRepository extends JpaRepository<MovimentoEstoque, Long> {

    /** Movimento ja gravado com a chave de idempotencia na empresa, se houver. */
    Optional<MovimentoEstoque> findByEmpresaIdAndChaveIdempotencia(Long empresaId, UUID chaveIdempotencia);
}
