package com.geitus.app.sales.venda;

import java.util.Collection;
import java.util.List;

import org.springframework.data.repository.Repository;

/** Itens das devolucoes, sempre filtrados pela empresa (DEC-016). So insercao e leitura. */
interface ItemDaDevolucaoRepository extends Repository<ItemDaDevolucao, Long> {

    ItemDaDevolucao saveAndFlush(ItemDaDevolucao item);

    /** Tudo o que ja foi devolvido da venda (o devolvido por linha). */
    List<ItemDaDevolucao> findByEmpresaIdAndVendaId(Long empresaId, Long vendaId);

    /** Os itens destas devolucoes, numa consulta. */
    List<ItemDaDevolucao> findByEmpresaIdAndDevolucaoIdInOrderByIdAsc(Long empresaId, Collection<Long> devolucaoIds);
}
