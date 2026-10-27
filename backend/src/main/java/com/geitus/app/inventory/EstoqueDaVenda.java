package com.geitus.app.inventory;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * O que o PDV faz no estoque (docs/modules/pdv.md): travar os
 * produtos da venda, baixar o estoque ao finalizar e devolver ao cancelar.
 * Publicada pelo {@code inventory} e implementada aqui mesmo; o {@code sales}
 * so conhece esta interface.
 *
 * <p>Todos os metodos exigem a transacao de quem chama. Os ids sao os
 * internos, ja resolvidos na empresa do usuario (DEC-016). Ordem das travas
 * (DT-032): a sessao de caixa primeiro (quem chama), depois os produtos em
 * ordem de id ({@link #travarSaldos}), na venda e no cancelamento.
 */
public interface EstoqueDaVenda {

    /** Uma linha da venda: o produto, o item gravado e o que ele baixa, na unidade de venda (&gt; 0). */
    record BaixaDeItem(Long produtoId, Long itemVendaId, BigDecimal quantidadeEstoque) {
    }

    /**
     * Trava ({@code FOR UPDATE}) os produtos em ordem de id e devolve o saldo
     * atual de cada um (0 sem linha de saldo). Produto de outra empresa fica
     * fora do mapa.
     */
    Map<Long, BigDecimal> travarSaldos(Long empresaId, Collection<Long> produtoIds);

    /**
     * Um movimento {@code SAIDA}/{@code VENDA} (origem {@code VENDA}) por item,
     * so dos produtos que controlam estoque. O saldo pode ficar negativo: a
     * regra "Vender sem estoque" e de quem chama.
     */
    void baixar(Long empresaId, Long usuarioId, List<BaixaDeItem> baixas);

    /**
     * Um movimento {@code ENTRADA}/{@code CANCELAMENTO_VENDA} (origem
     * {@code VENDA}) por item que baixou estoque, com a mesma quantidade da
     * baixa; o item sem baixa (produto sem controle na venda) fica de fora.
     */
    void estornar(Long empresaId, Long usuarioId, List<BaixaDeItem> baixas);
}
