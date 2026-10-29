package com.geitus.app.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MotivoMovimentoTest {

    @Test
    void devolucaoDeVendaESoDoSistemaENaEntrada() {
        assertThat(MotivoMovimento.DEVOLUCAO_VENDA.manual()).isFalse();
        assertThat(MotivoMovimento.DEVOLUCAO_VENDA.tipos()).containsExactly(TipoMovimento.ENTRADA);
        assertThat(MotivoMovimento.DEVOLUCAO_VENDA.rotulo()).isEqualTo("Devolução de venda");
        assertThat(MotivoMovimento.DEVOLUCAO_VENDA.aceitoNoAjusteManual(TipoMovimento.ENTRADA)).isFalse();
    }
}
