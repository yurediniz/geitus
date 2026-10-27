package com.geitus.app.inventory;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoRepository;

/**
 * Implementacao do {@link EstoqueDaVenda} (docs/modules/pdv.md).
 * Os movimentos passam pelo {@link EstoqueService}, que trava a linha de
 * saldo e grava o movimento ligado ao item da venda; a idempotencia e a da
 * venda ({@code uq_movimento_estoque_item_venda} e a ultima barreira).
 */
@Component
class EstoqueDasVendas implements EstoqueDaVenda {

    private final ProdutoRepository produtoRepository;
    private final EstoqueSaldoRepository saldoRepository;
    private final MovimentoEstoqueRepository movimentoRepository;
    private final EstoqueService estoqueService;

    EstoqueDasVendas(ProdutoRepository produtoRepository, EstoqueSaldoRepository saldoRepository,
            MovimentoEstoqueRepository movimentoRepository, EstoqueService estoqueService) {
        this.produtoRepository = produtoRepository;
        this.saldoRepository = saldoRepository;
        this.movimentoRepository = movimentoRepository;
        this.estoqueService = estoqueService;
    }

    /**
     * A trava e a das linhas dos produtos (a mesma da edicao e do ajuste
     * manual), num comando so e em ordem de id: duas vendas (ou uma venda e
     * um cancelamento) com os mesmos produtos em ordens diferentes nunca se
     * travam em ciclo (DT-032).
     */
    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Map<Long, BigDecimal> travarSaldos(Long empresaId, Collection<Long> produtoIds) {
        if (produtoIds.isEmpty()) {
            return Map.of();
        }
        List<Long> travados = produtoRepository.travarEmOrdemDeId(empresaId, produtoIds.toArray(Long[]::new));
        Map<Long, BigDecimal> saldos = new HashMap<>();
        travados.forEach(produtoId -> saldos.put(produtoId, BigDecimal.ZERO));
        if (!travados.isEmpty()) {
            saldoRepository.saldos(empresaId, travados)
                    .forEach(saldo -> saldos.put(saldo.produtoId(), saldo.saldo()));
        }
        return saldos;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void baixar(Long empresaId, Long usuarioId, List<BaixaDeItem> baixas) {
        Map<Long, Produto> produtos = produtos(empresaId, baixas);
        for (BaixaDeItem baixa : baixas) {
            Produto produto = produtos.get(baixa.produtoId());
            if (produto != null && produto.isControlaEstoque()) {
                estoqueService.registrarMovimentoDaVenda(produto, TipoMovimento.SAIDA, MotivoMovimento.VENDA,
                        baixa.quantidadeEstoque(), usuarioId, baixa.itemVendaId());
            }
        }
    }

    /** O estorno devolve exatamente o que a baixa do item tirou; o item sem baixa fica de fora. */
    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void estornar(Long empresaId, Long usuarioId, List<BaixaDeItem> baixas) {
        Map<Long, Produto> produtos = produtos(empresaId, baixas);
        Map<Long, BigDecimal> baixado = movimentoRepository.quantidadesDosItens(empresaId,
                baixas.stream().map(BaixaDeItem::itemVendaId).toList(), MotivoMovimento.VENDA).stream()
                .collect(Collectors.toMap(QuantidadeDoItem::itemVendaId, QuantidadeDoItem::quantidade));
        for (BaixaDeItem baixa : baixas) {
            BigDecimal quantidade = baixado.get(baixa.itemVendaId());
            Produto produto = produtos.get(baixa.produtoId());
            if (quantidade != null && produto != null) {
                estoqueService.registrarMovimentoDaVenda(produto, TipoMovimento.ENTRADA,
                        MotivoMovimento.CANCELAMENTO_VENDA, quantidade.abs(), usuarioId, baixa.itemVendaId());
            }
        }
    }

    private Map<Long, Produto> produtos(Long empresaId, List<BaixaDeItem> baixas) {
        if (baixas.isEmpty()) {
            return Map.of();
        }
        List<Long> ids = baixas.stream().map(BaixaDeItem::produtoId).distinct().toList();
        return produtoRepository.buscarComRelacoesPorIds(empresaId, ids).stream()
                .collect(Collectors.toMap(Produto::getId, Function.identity(), (primeiro, repetido) -> primeiro));
    }
}
