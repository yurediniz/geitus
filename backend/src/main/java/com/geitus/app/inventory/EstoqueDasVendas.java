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
 * saldo e grava o movimento ligado ao item da venda (ou ao item da
 * devolucao); a idempotencia e a da venda ou a da devolucao
 * ({@code uq_movimento_estoque_item_venda} e
 * {@code uq_movimento_estoque_item_devolucao} sao a ultima barreira).
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

    /**
     * So volta ao estoque o item que baixou estoque na venda (a baixa existe);
     * o avariado entra e sai em seguida, com a mesma quantidade.
     */
    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void devolver(Long empresaId, Long usuarioId, List<DevolucaoDeItem> itens) {
        if (itens.isEmpty()) {
            return;
        }
        Map<Long, Produto> produtos = produtosPorId(empresaId, itens.stream().map(DevolucaoDeItem::produtoId).toList());
        Map<Long, BigDecimal> baixado = movimentoRepository.quantidadesDosItens(empresaId,
                itens.stream().map(DevolucaoDeItem::itemVendaId).toList(), MotivoMovimento.VENDA).stream()
                .collect(Collectors.toMap(QuantidadeDoItem::itemVendaId, QuantidadeDoItem::quantidade));
        for (DevolucaoDeItem item : itens) {
            Produto produto = produtos.get(item.produtoId());
            if (produto == null || !baixado.containsKey(item.itemVendaId())) {
                continue;
            }
            estoqueService.registrarMovimentoDaDevolucao(produto, TipoMovimento.ENTRADA,
                    MotivoMovimento.DEVOLUCAO_VENDA, item.quantidadeEstoque(), usuarioId, item.itemDevolucaoId());
            if (item.avariado()) {
                estoqueService.registrarMovimentoDaDevolucao(produto, TipoMovimento.SAIDA,
                        MotivoMovimento.PERDA_AVARIA, item.quantidadeEstoque(), usuarioId, item.itemDevolucaoId());
            }
        }
    }

    private Map<Long, Produto> produtos(Long empresaId, List<BaixaDeItem> baixas) {
        return produtosPorId(empresaId, baixas.stream().map(BaixaDeItem::produtoId).toList());
    }

    private Map<Long, Produto> produtosPorId(Long empresaId, Collection<Long> produtoIds) {
        if (produtoIds.isEmpty()) {
            return Map.of();
        }
        List<Long> ids = produtoIds.stream().distinct().toList();
        return produtoRepository.buscarComRelacoesPorIds(empresaId, ids).stream()
                .collect(Collectors.toMap(Produto::getId, Function.identity(), (primeiro, repetido) -> primeiro));
    }
}
