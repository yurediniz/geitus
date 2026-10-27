package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.EnumMap;
import java.util.Map;
import java.util.Set;

import com.geitus.app.cashier.DadosDoCaixaInvalidosException;
import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.cashier.sessao.dto.MensagensDeValor;

/**
 * Valores contados por forma, conferidos contra as formas da sessao
 * (docs/modules/pdv.md): o dinheiro sempre e as outras formas quando
 * tiveram movimento. Cada problema e um 400 com o campo
 * {@code contagens.{FORMA}}, na ordem das formas.
 */
final class ContagemInformada {

    static final String CAMPO = "contagens";
    static final String MENSAGEM_INFORME = "Informe o valor contado de %s.";
    static final String MENSAGEM_NEGATIVO = "O valor contado não pode ser negativo.";
    static final String MENSAGEM_SEM_MOVIMENTO = "%s não teve movimento neste caixa.";

    private static final int CASAS_DO_DINHEIRO = 2;
    private static final int DIGITOS_INTEIROS = 10;

    private ContagemInformada() {
        // Apenas metodos estaticos.
    }

    /**
     * Os valores das formas da sessao, na escala do dinheiro e na ordem das
     * formas. Forma faltando, valor invalido e forma sem movimento: 400.
     */
    static Map<FormaDePagamento, BigDecimal> validar(Map<FormaDePagamento, BigDecimal> informadas,
            Set<FormaDePagamento> formasDaSessao) {
        Map<FormaDePagamento, BigDecimal> contados = new EnumMap<>(FormaDePagamento.class);
        for (FormaDePagamento forma : FormaDePagamento.values()) {
            BigDecimal valor = informadas.get(forma);
            if (formasDaSessao.contains(forma)) {
                contados.put(forma, valorValido(forma, valor));
            } else if (informadas.containsKey(forma)) {
                throw invalido(MENSAGEM_SEM_MOVIMENTO.formatted(forma.rotulo()), forma);
            }
        }
        return contados;
    }

    private static BigDecimal valorValido(FormaDePagamento forma, BigDecimal valor) {
        if (valor == null) {
            throw invalido(MENSAGEM_INFORME.formatted(forma.rotulo()), forma);
        }
        if (valor.signum() < 0) {
            throw invalido(MENSAGEM_NEGATIVO, forma);
        }
        BigDecimal semZeros = valor.stripTrailingZeros();
        int casas = Math.max(semZeros.scale(), 0);
        if (casas > CASAS_DO_DINHEIRO || semZeros.precision() - semZeros.scale() > DIGITOS_INTEIROS) {
            throw invalido(MensagensDeValor.ATE_DUAS_CASAS, forma);
        }
        return valor.setScale(CASAS_DO_DINHEIRO, RoundingMode.UNNECESSARY);
    }

    private static DadosDoCaixaInvalidosException invalido(String mensagem, FormaDePagamento forma) {
        return new DadosDoCaixaInvalidosException(mensagem, CAMPO + "." + forma.name());
    }
}
