package com.geitus.app.inventory;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Custo de uma entrada por compra (Fase B4, docs/modules/produtos-custo-entrada.md,
 * 2.1; V13): o valor digitado, em centavos, e o custo por unidade de venda com
 * 4 casas. Em unidades, o por unidade e o proprio digitado; em embalagens, o
 * digitado e o de 1 embalagem e o por unidade e a divisao pelas unidades dela,
 * meio para cima (a mesma conta da CHECK {@code ck_movimento_estoque_custo_unitario}).
 */
record CustoDaCompra(BigDecimal informado, BigDecimal porUnidade) {

    /** {@code custo_informado NUMERIC(12,2)}. */
    static final int CASAS_DO_INFORMADO = 2;
    /** {@code custo_unitario NUMERIC(14,4)}. */
    static final int CASAS_DO_CUSTO_POR_UNIDADE = 4;

    /**
     * Custo digitado na unidade de venda ({@code embalagem} nula) ou em 1
     * embalagem. Os dois valores ficam na escala das colunas: a resposta do
     * ajuste e a da repeticao pela chave (lida do banco) sao iguais.
     */
    static CustoDaCompra de(BigDecimal digitado, RetratoDaEmbalagem embalagem) {
        BigDecimal informado = digitado.setScale(CASAS_DO_INFORMADO, RoundingMode.HALF_UP);
        BigDecimal porUnidade = embalagem == null
                ? informado.setScale(CASAS_DO_CUSTO_POR_UNIDADE)
                : informado.divide(embalagem.quantidadePorEmbalagem(), CASAS_DO_CUSTO_POR_UNIDADE,
                        RoundingMode.HALF_UP);
        return new CustoDaCompra(informado, porUnidade);
    }

    /**
     * Maior que zero no digitado e no por unidade (V13). Um centavo dividido por
     * uma embalagem grande arredonda a zero e e recusado como custo zero.
     */
    boolean positivo() {
        return informado.signum() > 0 && porUnidade.signum() > 0;
    }
}
