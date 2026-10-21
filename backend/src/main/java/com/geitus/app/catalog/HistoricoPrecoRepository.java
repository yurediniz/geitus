package com.geitus.app.catalog;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.geitus.app.catalog.dto.HistoricoPrecoResponse;

/** Acesso ao historico de precos do produto (tabela so de insercao, V8). */
public interface HistoricoPrecoRepository extends JpaRepository<HistoricoPreco, Long> {

    /**
     * Historico do produto, do mais recente para o mais antigo (desempate pelo
     * id), ja com o nome do usuario. Filtra pela empresa alem do produto
     * (DEC-016) e atende o indice {@code ix_historico_preco_produto}. O
     * {@code pageable} nao deve trazer ordenacao: a ordem e a da consulta.
     */
    @Query(value = """
            SELECT new com.geitus.app.catalog.dto.HistoricoPrecoResponse(
                       h.campo, h.valorAnterior, h.valorNovo, u.nome, h.alteradoEm)
              FROM HistoricoPreco h
              JOIN Usuario u ON u.id = h.usuarioId AND u.empresa.id = h.empresaId
             WHERE h.empresaId = :empresaId
               AND h.produto.id = :produtoId
             ORDER BY h.alteradoEm DESC, h.id DESC
            """,
            countQuery = """
            SELECT count(h)
              FROM HistoricoPreco h
             WHERE h.empresaId = :empresaId
               AND h.produto.id = :produtoId
            """)
    Page<HistoricoPrecoResponse> historicoDoProduto(@Param("empresaId") Long empresaId,
            @Param("produtoId") Long produtoId, Pageable pageable);
}
