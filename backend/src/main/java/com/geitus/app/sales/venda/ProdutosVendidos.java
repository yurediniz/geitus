package com.geitus.app.sales.venda;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.UsoDoProdutoEmVendas;

/** Os produtos com venda, para o {@code podeExcluir} e a exclusao do catalogo (produto vendido nao e excluido). */
@Component
class ProdutosVendidos implements UsoDoProdutoEmVendas {

    private final ItemDaVendaRepository itemRepository;

    ProdutosVendidos(ItemDaVendaRepository itemRepository) {
        this.itemRepository = itemRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Long> produtosComVendas(Long empresaId, Collection<Long> produtoIds) {
        if (produtoIds.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(itemRepository.produtosVendidos(empresaId, produtoIds));
    }
}
