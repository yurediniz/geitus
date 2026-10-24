package com.geitus.app.sales.venda;

import java.util.Collection;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.cashier.NumerosDasVendas;

/** O numero das vendas para a lista de movimentos do caixa ("Venda nº 128"), numa consulta. */
@Component
class NumerosDasVendasDoPdv implements NumerosDasVendas {

    private final VendaRepository vendaRepository;

    NumerosDasVendasDoPdv(VendaRepository vendaRepository) {
        this.vendaRepository = vendaRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, Long> porIds(Long empresaId, Collection<Long> vendaIds) {
        if (vendaIds.isEmpty()) {
            return Map.of();
        }
        return vendaRepository.numeros(empresaId, vendaIds).stream()
                .collect(Collectors.toMap(VendaRepository.NumeroDaVenda::id, VendaRepository.NumeroDaVenda::numero));
    }
}
