package com.geitus.app.sales.venda;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Itens das vendas, sempre filtrados pela empresa (DEC-016). So insercao e leitura. */
interface ItemDaVendaRepository extends Repository<ItemDaVenda, Long> {

    ItemDaVenda saveAndFlush(ItemDaVenda item);

    List<ItemDaVenda> findByEmpresaIdAndVendaIdOrderByOrdemAsc(Long empresaId, Long vendaId);

    /** Os produtos destes que tem algum item de venda (a FK RESTRICT do item tambem barra a exclusao). */
    @Query("""
            SELECT DISTINCT i.produtoId
              FROM ItemDaVenda i
             WHERE i.empresaId = :empresaId AND i.produtoId IN :produtoIds
            """)
    List<Long> produtosVendidos(@Param("empresaId") Long empresaId,
            @Param("produtoIds") java.util.Collection<Long> produtoIds);

    /** O produto (UUID publico) de cada item, na ordem: reconhece a repeticao do mesmo pedido pela chave. */
    record ProdutoDoItem(short ordem, UUID produtoId) {
    }

    @Query("""
            SELECT new com.geitus.app.sales.venda.ItemDaVendaRepository$ProdutoDoItem(i.ordem, p.uuid)
              FROM ItemDaVenda i
              JOIN Produto p ON p.id = i.produtoId AND p.empresa.id = i.empresaId
             WHERE i.empresaId = :empresaId AND i.vendaId = :vendaId
             ORDER BY i.ordem
            """)
    List<ProdutoDoItem> produtosDosItens(@Param("empresaId") Long empresaId, @Param("vendaId") Long vendaId);
}
