package com.geitus.app.sales.venda;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

import com.geitus.app.sales.DadosDaVendaInvalidosException;
import com.geitus.app.sales.venda.CalculadoraDaDevolucao.LinhaDevolvida;
import com.geitus.app.sales.venda.CalculadoraDaDevolucao.LinhaVendida;

class CalculadoraDaDevolucaoTest {

    private static final String CAMPO = "itens[0].quantidade";

    /** 3 UN, liquido R$ 10,00, nada devolvido. */
    private static LinhaVendida tresUnidades(String devolvida, String valorDevolvido) {
        return new LinhaVendida("UN", null, false, false, new BigDecimal("3"), new BigDecimal("10.00"),
                new BigDecimal(devolvida), new BigDecimal(valorDevolvido));
    }

    @Test
    void valorProporcionalAoLiquidoMeioParaCimaEAUltimaLevaOResto() {
        LinhaDevolvida primeira = CalculadoraDaDevolucao.calcular(tresUnidades("0", "0"), new BigDecimal("1"), CAMPO);
        LinhaDevolvida segunda = CalculadoraDaDevolucao.calcular(tresUnidades("1", "3.33"), new BigDecimal("1"),
                CAMPO);
        LinhaDevolvida ultima = CalculadoraDaDevolucao.calcular(tresUnidades("2", "6.66"), new BigDecimal("1"),
                CAMPO);

        assertThat(primeira.valor()).isEqualByComparingTo("3.33");
        assertThat(segunda.valor()).isEqualByComparingTo("3.33");
        assertThat(ultima.valor()).isEqualByComparingTo("3.34");
        assertThat(primeira.quantidadeEstoque()).isEqualByComparingTo("1");
    }

    @Test
    void proporcionalNuncaPassaDoQueRestaNaLinha() {
        // Liquido 0,03 em 6 UN: cada UN da 0,005 (0,01 meio para cima); a quarta ja nao cabe.
        LinhaVendida linha = new LinhaVendida("UN", null, false, false, new BigDecimal("6"), new BigDecimal("0.03"),
                new BigDecimal("3"), new BigDecimal("0.03"));

        assertThat(CalculadoraDaDevolucao.calcular(linha, BigDecimal.ONE, CAMPO).valor()).isEqualByComparingTo("0");
    }

    @Test
    void linhaDeLiquidoZeroDevolveComValorZero() {
        LinhaVendida brinde = new LinhaVendida("UN", null, false, false, BigDecimal.ONE, new BigDecimal("0.00"),
                BigDecimal.ZERO, BigDecimal.ZERO);

        assertThat(CalculadoraDaDevolucao.calcular(brinde, BigDecimal.ONE, CAMPO).valor()).isEqualByComparingTo("0");
    }

    @Test
    void embalagemDevolveNumeroInteiroEMultiplicaOEstoque() {
        LinhaVendida caixas = new LinhaVendida("CX c/ 12 UN", new BigDecimal("12"), false, false, new BigDecimal("3"),
                new BigDecimal("90.00"), BigDecimal.ZERO, BigDecimal.ZERO);

        LinhaDevolvida duas = CalculadoraDaDevolucao.calcular(caixas, new BigDecimal("2"), CAMPO);

        assertThat(duas.quantidadeEstoque()).isEqualByComparingTo("24");
        assertThat(duas.valor()).isEqualByComparingTo("60.00");
        assertErro(() -> CalculadoraDaDevolucao.calcular(caixas, new BigDecimal("1.5"), CAMPO),
                CalculadoraDaDevolucao.MENSAGEM_EMBALAGENS_INTEIRAS);
    }

    @Test
    void unidadeNaoFracionadaSoInteiraEFracionadaAteTresCasas() {
        assertErro(() -> CalculadoraDaDevolucao.calcular(tresUnidades("0", "0"), new BigDecimal("0.5"), CAMPO),
                CalculadoraDaDevolucao.MENSAGEM_UNIDADE_INTEIRA);

        LinhaVendida quilos = new LinhaVendida("KG", null, false, true, new BigDecimal("2.500"), new BigDecimal("50.00"),
                BigDecimal.ZERO, BigDecimal.ZERO);
        assertThat(CalculadoraDaDevolucao.calcular(quilos, new BigDecimal("1.25"), CAMPO).valor())
                .isEqualByComparingTo("25.00");
        assertErro(() -> CalculadoraDaDevolucao.calcular(quilos, new BigDecimal("0.0005"), CAMPO),
                CalculadoraDaDevolucao.MENSAGEM_TRES_CASAS);
    }

    @Test
    void etiquetaDeBalancaSoVoltaInteira() {
        LinhaVendida etiqueta = new LinhaVendida("KG", null, true, true, new BigDecimal("1.250"),
                new BigDecimal("25.00"), BigDecimal.ZERO, BigDecimal.ZERO);

        assertErro(() -> CalculadoraDaDevolucao.calcular(etiqueta, new BigDecimal("1"), CAMPO),
                "Item de balança só volta inteiro (1,25 KG).");
        assertThat(CalculadoraDaDevolucao.calcular(etiqueta, new BigDecimal("1.25"), CAMPO).valor())
                .isEqualByComparingTo("25.00");
    }

    @Test
    void quantidadeAlemDoDisponivelZeradaOuJaDevolvida() {
        assertErro(() -> CalculadoraDaDevolucao.calcular(tresUnidades("1", "3.33"), new BigDecimal("3"), CAMPO),
                "Só restam 2 UN para devolver nesta linha.");
        assertErro(() -> CalculadoraDaDevolucao.calcular(tresUnidades("0", "0"), BigDecimal.ZERO, CAMPO),
                CalculadoraDaDevolucao.MENSAGEM_INFORME_A_QUANTIDADE);
        assertErro(() -> CalculadoraDaDevolucao.calcular(tresUnidades("3", "10.00"), BigDecimal.ONE, CAMPO),
                CalculadoraDaDevolucao.MENSAGEM_LINHA_JA_DEVOLVIDA);
    }

    private static void assertErro(Runnable acao, String mensagem) {
        assertThatThrownBy(acao::run)
                .isInstanceOf(DadosDaVendaInvalidosException.class)
                .hasMessage(mensagem);
    }
}
