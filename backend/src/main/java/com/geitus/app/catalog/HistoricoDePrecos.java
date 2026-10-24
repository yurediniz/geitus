package com.geitus.app.catalog;

import java.math.BigDecimal;

import org.springframework.stereotype.Component;

/**
 * Grava o historico de precos do produto (docs/modules/produtos-precos.md,
 * 4.6): uma linha por campo que realmente mudou, comparando numericamente
 * (10,00 = 10,0) e tratando nulo. Chamado depois do {@code save} (o produto
 * novo ja tem id), na mesma transacao: se o produto nao for gravado, nada e
 * registrado.
 */
@Component
public class HistoricoDePrecos {

    private final HistoricoPrecoRepository historicoPrecoRepository;

    public HistoricoDePrecos(HistoricoPrecoRepository historicoPrecoRepository) {
        this.historicoPrecoRepository = historicoPrecoRepository;
    }

    /**
     * Preco de venda e custo do produto contra os anteriores (nulos no
     * cadastro). O custo que muda aqui veio do cadastro: origem {@code EDICAO}.
     */
    public void registrarCustoEPrecoDeVenda(Produto produto, Long usuarioId, BigDecimal custoAnterior,
            BigDecimal precoAnterior) {
        if (!mesmoValor(precoAnterior, produto.getPrecoVenda())) {
            historicoPrecoRepository.save(HistoricoPreco.doPrecoDeVenda(produto, precoAnterior,
                    produto.getPrecoVenda(), usuarioId));
        }
        registrarCustoSeMudou(produto, usuarioId, OrigemDoCusto.EDICAO, custoAnterior, null);
    }

    /**
     * Custo que mudou por uma entrada por compra (Fase B4, 3): origem
     * {@code ENTRADA_COMPRA}, ligada ao movimento; so se o valor mudou.
     */
    public void registrarCustoDeEntradaSeMudou(Produto produto, Long usuarioId, BigDecimal custoAnterior,
            Long movimentoId) {
        registrarCustoSeMudou(produto, usuarioId, OrigemDoCusto.ENTRADA_COMPRA, custoAnterior, movimentoId);
    }

    private void registrarCustoSeMudou(Produto produto, Long usuarioId, OrigemDoCusto origem,
            BigDecimal anterior, Long movimentoId) {
        if (!mesmoValor(anterior, produto.getCusto())) {
            historicoPrecoRepository.save(HistoricoPreco.doCusto(produto, origem, anterior, produto.getCusto(),
                    usuarioId, movimentoId));
        }
    }

    /** Preco proprio de uma embalagem (Fase B3, 3.4), com o rotulo do momento; so se mudou. */
    public void registrarPrecoDaEmbalagemSeMudou(Produto produto, Long usuarioId, String embalagemRotulo,
            BigDecimal anterior, BigDecimal novo) {
        if (!mesmoValor(anterior, novo)) {
            historicoPrecoRepository.save(HistoricoPreco.daEmbalagem(produto, embalagemRotulo, anterior, novo,
                    usuarioId));
        }
    }

    /** Comparacao numerica (10,00 = 10,0) que trata nulo; tambem usada para saber se o custo mudou. */
    static boolean mesmoValor(BigDecimal anterior, BigDecimal novo) {
        if (anterior == null || novo == null) {
            return anterior == novo;
        }
        return anterior.compareTo(novo) == 0;
    }
}
