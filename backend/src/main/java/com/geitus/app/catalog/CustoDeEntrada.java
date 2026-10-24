package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Aplica no produto o custo de uma entrada por compra (Fase B4,
 * docs/modules/produtos-custo-entrada.md, 2.2; DEC-038). Fica no catalogo e e
 * chamado pelo estoque depois de gravar o movimento, na mesma transacao: o
 * catalogo nao depende do estoque, e uma falha desfaz o movimento, o saldo e o
 * custo juntos.
 */
@Component
public class CustoDeEntrada {

    /** O custo do produto tem centavos ({@code NUMERIC(12,2)}). */
    static final int CASAS_DO_CUSTO_DO_PRODUTO = 2;

    private final HistoricoDePrecos historicoDePrecos;

    public CustoDeEntrada(HistoricoDePrecos historicoDePrecos) {
        this.historicoDePrecos = historicoDePrecos;
    }

    /**
     * O custo que o produto recebe de um custo por unidade: arredondado a
     * centavos, meio para cima (CX c/ 3 a R$ 100,00 = 33,3333 -> 33,33). O
     * estoque usa a mesma conta para recusar o custo que daria zero.
     */
    public static BigDecimal custoDoProduto(BigDecimal custoUnitario) {
        return custoUnitario.setScale(CASAS_DO_CUSTO_DO_PRODUTO, RoundingMode.HALF_UP);
    }

    /**
     * O custo do produto passa a ser o {@link #custoDoProduto} da compra, com a
     * origem {@code ENTRADA_COMPRA} e a data do movimento (spec 4), mesmo sem
     * mudar o valor; o historico ganha a linha do custo ligada ao movimento so
     * se o valor mudou. Exige o produto travado e o movimento ja gravado por
     * quem chama.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void registrar(Produto produto, CompraComCusto compra, Long usuarioId) {
        BigDecimal custoAnterior = produto.getCusto();
        produto.registrarCustoDeEntrada(custoDoProduto(compra.custoUnitario()), compra.em());
        historicoDePrecos.registrarCustoDeEntradaSeMudou(produto, usuarioId, custoAnterior, compra.movimentoId());
    }
}
