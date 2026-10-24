package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

/** Rotulo da embalagem (docs/modules/produtos-embalagens.md, 2.2): o mesmo texto no backend e no frontend. */
class RotuloDaEmbalagemTest {

    @Test
    void quantidadeInteiraSemZerosADireita() {
        assertThat(RotuloDaEmbalagem.de("CX", new BigDecimal("3.000"), "UN")).isEqualTo("CX c/ 3 UN");
    }

    @Test
    void quantidadeDecimalComVirgula() {
        assertThat(RotuloDaEmbalagem.de("SC", new BigDecimal("25.500"), "KG")).isEqualTo("SC c/ 25,5 KG");
    }

    /** {@code stripTrailingZeros} de 10 vira 1E+1: o texto sai sem notacao cientifica. */
    @Test
    void dezenasSemNotacaoCientifica() {
        assertThat(RotuloDaEmbalagem.de("FD", new BigDecimal("120.000"), "UN")).isEqualTo("FD c/ 120 UN");
    }
}
