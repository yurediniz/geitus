package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.geitus.app.catalog.Produto;
import com.geitus.app.shared.formato.FormatoBrasileiro;

/**
 * Saldo de estoque das linhas (docs/modules/pdv.md): para cada
 * produto que controla estoque, a soma das quantidades de estoque das linhas
 * dele contra o saldo atual. Com "Vender sem estoque" ligada, o saldo menor e
 * um aviso em cada linha do produto; desligada, um erro (409 ao finalizar).
 * Regra pura: os saldos vem de quem chama.
 */
public final class ConferenciaDoEstoque {

    static final String MENSAGEM_AVISO = "Estoque insuficiente (saldo %s %s).";
    static final String MENSAGEM_ERRO = "Estoque insuficiente para %s (saldo %s %s).";

    private ConferenciaDoEstoque() {
        // Apenas metodos estaticos.
    }

    /** Erros (com "Vender sem estoque" desligada) ou avisos, no campo {@code itens[i]} de cada linha. */
    public record Resultado(List<ErroDoCalculo> erros, List<ErroDoCalculo> avisos) {

        public Resultado {
            erros = List.copyOf(erros);
            avisos = List.copyOf(avisos);
        }
    }

    /**
     * @param saldos saldo atual por id interno do produto (sem o produto no
     *        mapa, o saldo e 0)
     */
    public static Resultado conferir(List<LinhaCalculada> linhas, Map<Long, BigDecimal> saldos,
            boolean venderSemEstoque) {
        Map<Long, BigDecimal> somas = new LinkedHashMap<>();
        for (LinhaCalculada linha : linhas) {
            if (linha.produto().isControlaEstoque()) {
                somas.merge(linha.produto().getId(), linha.quantidadeEstoque(), BigDecimal::add);
            }
        }
        List<ErroDoCalculo> erros = new ArrayList<>();
        List<ErroDoCalculo> avisos = new ArrayList<>();
        for (LinhaCalculada linha : linhas) {
            Produto produto = linha.produto();
            BigDecimal soma = somas.get(produto.getId());
            BigDecimal saldo = saldos.getOrDefault(produto.getId(), BigDecimal.ZERO);
            if (soma == null || saldo.compareTo(soma) >= 0) {
                continue;
            }
            String saldoComSigla = FormatoBrasileiro.numero(saldo);
            String sigla = produto.getUnidade().getSigla();
            if (venderSemEstoque) {
                avisos.add(new ErroDoCalculo(linha.campo(), MENSAGEM_AVISO.formatted(saldoComSigla, sigla)));
            } else {
                erros.add(new ErroDoCalculo(linha.campo(),
                        MENSAGEM_ERRO.formatted(produto.getNome(), saldoComSigla, sigla)));
            }
        }
        return new Resultado(erros, avisos);
    }
}
