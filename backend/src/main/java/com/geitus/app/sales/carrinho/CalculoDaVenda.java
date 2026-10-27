package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import com.geitus.app.cashier.FormaDePagamento;

/**
 * Resultado da {@link CalculadoraDaVenda} (docs/modules/pdv.md): as
 * linhas calculadas, os totais, o pagamento, os pagamentos validos por forma
 * (na escala do dinheiro: o que a venda grava), o recebido por forma (o que
 * vai para o caixa: no dinheiro, ja sem o troco) e as regras violadas em
 * {@code erros} (o calculo nao lanca excecao por regra). {@code avisos} nao
 * impedem a venda (estoque insuficiente com "Vender sem estoque" ligada).
 */
public record CalculoDaVenda(List<LinhaCalculada> linhas, BigDecimal subtotal, BigDecimal descontoItens,
        BigDecimal descontoTotal, BigDecimal total, BigDecimal pago, BigDecimal troco, BigDecimal faltaPagar,
        Map<FormaDePagamento, BigDecimal> pagamentosPorForma, Map<FormaDePagamento, BigDecimal> recebidosPorForma,
        List<ErroDoCalculo> erros, List<ErroDoCalculo> avisos) {

    public CalculoDaVenda {
        linhas = List.copyOf(linhas);
        pagamentosPorForma = naOrdemDasFormas(pagamentosPorForma);
        recebidosPorForma = naOrdemDasFormas(recebidosPorForma);
        erros = List.copyOf(erros);
        avisos = List.copyOf(avisos);
    }

    /** O mesmo calculo com os erros e avisos da conferencia do estoque acrescentados. */
    public CalculoDaVenda comEstoque(ConferenciaDoEstoque.Resultado estoque) {
        List<ErroDoCalculo> todosOsErros = new ArrayList<>(erros);
        todosOsErros.addAll(estoque.erros());
        List<ErroDoCalculo> todosOsAvisos = new ArrayList<>(avisos);
        todosOsAvisos.addAll(estoque.avisos());
        return new CalculoDaVenda(linhas, subtotal, descontoItens, descontoTotal, total, pago, troco, faltaPagar,
                pagamentosPorForma, recebidosPorForma, todosOsErros, todosOsAvisos);
    }

    private static Map<FormaDePagamento, BigDecimal> naOrdemDasFormas(Map<FormaDePagamento, BigDecimal> valores) {
        Map<FormaDePagamento, BigDecimal> naOrdem = new EnumMap<>(FormaDePagamento.class);
        naOrdem.putAll(valores);
        return Collections.unmodifiableMap(naOrdem);
    }
}
