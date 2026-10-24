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

    /** Preco de venda e custo do produto contra os anteriores (nulos no cadastro). */
    public void registrarCustoEPrecoDeVenda(Produto produto, Long usuarioId, BigDecimal custoAnterior,
            BigDecimal precoAnterior) {
        registrarSeMudou(produto, usuarioId, CampoHistoricoPreco.PRECO_VENDA, precoAnterior, produto.getPrecoVenda());
        registrarSeMudou(produto, usuarioId, CampoHistoricoPreco.CUSTO, custoAnterior, produto.getCusto());
    }

    public void registrarSeMudou(Produto produto, Long usuarioId, CampoHistoricoPreco campo, BigDecimal anterior,
            BigDecimal novo) {
        if (!mesmoValor(anterior, novo)) {
            historicoPrecoRepository.save(new HistoricoPreco(produto, campo, anterior, novo, usuarioId));
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

    private static boolean mesmoValor(BigDecimal anterior, BigDecimal novo) {
        if (anterior == null || novo == null) {
            return anterior == novo;
        }
        return anterior.compareTo(novo) == 0;
    }
}
