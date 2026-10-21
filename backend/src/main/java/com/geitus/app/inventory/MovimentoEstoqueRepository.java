package com.geitus.app.inventory;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.geitus.app.inventory.dto.MovimentoEstoqueResponse;

/**
 * Acesso aos movimentos de estoque (tabela so de insercao, V9). Toda consulta
 * filtra pela empresa (DEC-016).
 */
public interface MovimentoEstoqueRepository extends JpaRepository<MovimentoEstoque, Long> {

    /** Movimento ja gravado com a chave de idempotencia na empresa, se houver. */
    Optional<MovimentoEstoque> findByEmpresaIdAndChaveIdempotencia(Long empresaId, UUID chaveIdempotencia);

    /**
     * Movimentos do produto, do mais recente para o mais antigo (desempate pelo
     * id), ja com o nome do usuario. Filtra pela empresa alem do produto
     * (DEC-016) e atende o indice {@code ix_movimento_estoque_produto}. O
     * {@code pageable} nao deve trazer ordenacao: a ordem e a da consulta.
     */
    @Query(value = """
            SELECT new com.geitus.app.inventory.dto.MovimentoEstoqueResponse(
                       m.uuid, m.tipo, m.motivo, m.origem, m.quantidade, m.saldoAnterior, m.saldoNovo,
                       m.observacao, u.nome, m.criadoEm)
              FROM MovimentoEstoque m
              JOIN Usuario u ON u.id = m.usuarioId AND u.empresa.id = m.empresaId
             WHERE m.empresaId = :empresaId
               AND m.produto.id = :produtoId
             ORDER BY m.criadoEm DESC, m.id DESC
            """,
            countQuery = """
            SELECT count(m)
              FROM MovimentoEstoque m
             WHERE m.empresaId = :empresaId
               AND m.produto.id = :produtoId
            """)
    Page<MovimentoEstoqueResponse> movimentosDoProduto(@Param("empresaId") Long empresaId,
            @Param("produtoId") Long produtoId, Pageable pageable);
}
