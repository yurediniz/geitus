package com.geitus.app.sales.venda;

import java.util.Collection;
import java.util.List;

import org.springframework.data.repository.Repository;

/** Pagamentos das vendas, sempre filtrados pela empresa (DEC-016). So insercao e leitura. */
interface PagamentoDaVendaRepository extends Repository<PagamentoDaVenda, Long> {

    PagamentoDaVenda saveAndFlush(PagamentoDaVenda pagamento);

    /** Os pagamentos das vendas de uma pagina, numa consulta. */
    List<PagamentoDaVenda> findByEmpresaIdAndVendaIdIn(Long empresaId, Collection<Long> vendaIds);
}
