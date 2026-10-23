package com.geitus.app.catalog.balanca;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import com.geitus.app.catalog.CodigoBarras;

/**
 * Regra de leitura da etiqueta de balanca (docs/modules/produtos-codigo-e-balanca.md,
 * 3.2 e 9): so 13 digitos com o prefixo, codigo sem zeros, informacao dividida
 * por 10^casas e, com DV, EAN-13 valido.
 *
 * <p>Os modelos prontos (spec 3.3) foram lidos assim, com prefixo "2":
 * <ul>
 *   <li>"Toledo, codigo 6 + valor 6 (3 casas), sem DV": 2 + 6 + 0 + 6 = 13 (o padrao);</li>
 *   <li>"Toledo, codigo 4 + 0 + valor 6 (2 casas) + DV": 2 + 4 + 1 zero + 6 + DV = 13;</li>
 *   <li>"Toledo, codigo 5 + valor 5 (2 casas) + DV": 2 + 5 + 1 zero + 5 + DV = 13;</li>
 *   <li>"Peso, codigo 6 + peso 5 (3 casas) + DV": 2 + 6 + 0 + 5 + DV = 13.</li>
 * </ul>
 */
class LeitorEtiquetaBalancaTest {

    private static final ConfiguracaoEtiqueta TOLEDO_CODIGO_4_COM_ZERO =
            new ConfiguracaoEtiqueta("2", 4, 1, TipoInformacaoEtiqueta.VALOR, 6, 2, true);
    private static final ConfiguracaoEtiqueta TOLEDO_CODIGO_5 =
            new ConfiguracaoEtiqueta("2", 5, 1, TipoInformacaoEtiqueta.VALOR, 5, 2, true);
    private static final ConfiguracaoEtiqueta PESO_CODIGO_6 =
            new ConfiguracaoEtiqueta("2", 6, 0, TipoInformacaoEtiqueta.PESO, 5, 3, true);

    @Test
    void exemploRealDoUsuario() {
        assertThat(LeitorEtiquetaBalanca.ler("2000542010000", ConfiguracaoEtiqueta.padrao()))
                .contains(new LeituraEtiqueta(542, TipoInformacaoEtiqueta.VALOR, new BigDecimal("10.000")));
    }

    /** O valor sai com a escala das casas decimais (10.000, nao 10). */
    @Test
    void valorComAEscalaDasCasas() {
        LeituraEtiqueta leitura = LeitorEtiquetaBalanca.ler("2000542010000", ConfiguracaoEtiqueta.padrao())
                .orElseThrow();

        assertThat(leitura.valor().scale()).isEqualTo(3);
        assertThat(leitura.valor()).isEqualByComparingTo("10");
    }

    @Test
    void modeloToledoCodigo4ComZeroEDv() {
        String etiqueta = "2054200010008";
        assertThat(CodigoBarras.digitoVerificadorValido(etiqueta)).isTrue();

        assertThat(LeitorEtiquetaBalanca.ler(etiqueta, TOLEDO_CODIGO_4_COM_ZERO))
                .contains(new LeituraEtiqueta(542, TipoInformacaoEtiqueta.VALOR, new BigDecimal("10.00")));
    }

    @Test
    void modeloToledoCodigo5EDv() {
        String etiqueta = "2005420010002";
        assertThat(CodigoBarras.digitoVerificadorValido(etiqueta)).isTrue();

        assertThat(LeitorEtiquetaBalanca.ler(etiqueta, TOLEDO_CODIGO_5))
                .contains(new LeituraEtiqueta(542, TipoInformacaoEtiqueta.VALOR, new BigDecimal("10.00")));
    }

    @Test
    void peso3Casas() {
        String etiqueta = "2000542007503";
        assertThat(CodigoBarras.digitoVerificadorValido(etiqueta)).isTrue();

        assertThat(LeitorEtiquetaBalanca.ler(etiqueta, PESO_CODIGO_6))
                .contains(new LeituraEtiqueta(542, TipoInformacaoEtiqueta.PESO, new BigDecimal("0.750")));
    }

    /** Os digitos de preenchimento (entre o codigo e a informacao) nao entram em nenhum campo. */
    @Test
    void preenchimentoIgnorado() {
        ConfiguracaoEtiqueta comDoisDePreenchimento =
                new ConfiguracaoEtiqueta("2", 4, 2, TipoInformacaoEtiqueta.VALOR, 6, 2, false);
        LeituraEtiqueta esperada = new LeituraEtiqueta(542, TipoInformacaoEtiqueta.VALOR, new BigDecimal("10.00"));

        assertThat(LeitorEtiquetaBalanca.ler("2054200001000", comDoisDePreenchimento)).contains(esperada);
        assertThat(LeitorEtiquetaBalanca.ler("2054297001000", comDoisDePreenchimento)).contains(esperada);
    }

    @Test
    void doze_e_quatorze_digitos_vazio() {
        assertThat(LeitorEtiquetaBalanca.ler("200054201000", ConfiguracaoEtiqueta.padrao())).isEmpty();
        assertThat(LeitorEtiquetaBalanca.ler("20005420100000", ConfiguracaoEtiqueta.padrao())).isEmpty();
    }

    @Test
    void prefixoDiferente_vazio() {
        assertThat(LeitorEtiquetaBalanca.ler("7000542010000", ConfiguracaoEtiqueta.padrao())).isEmpty();
        ConfiguracaoEtiqueta prefixoDuplo = new ConfiguracaoEtiqueta("20", 5, 0, TipoInformacaoEtiqueta.VALOR, 6, 3,
                false);
        assertThat(LeitorEtiquetaBalanca.ler("2100542010000", prefixoDuplo)).isEmpty();
        assertThat(LeitorEtiquetaBalanca.ler("2000542010000", prefixoDuplo))
                .contains(new LeituraEtiqueta(542, TipoInformacaoEtiqueta.VALOR, new BigDecimal("10.000")));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = { "200054201000a", "2000542 10000", "２０００５４２０１００００", "-200054201000" })
    void naoNumerico_vazio(String lido) {
        assertThat(LeitorEtiquetaBalanca.ler(lido, ConfiguracaoEtiqueta.padrao())).isEmpty();
    }

    @Test
    void dvInvalido_vazio() {
        assertThat(LeitorEtiquetaBalanca.ler("2000542007504", PESO_CODIGO_6)).isEmpty();
        assertThat(LeitorEtiquetaBalanca.ler("2054200010009", TOLEDO_CODIGO_4_COM_ZERO)).isEmpty();
    }

    /** Codigo 000000 nao e um codigo de produto (1 a 999999). */
    @Test
    void codigoZero_vazio() {
        assertThat(LeitorEtiquetaBalanca.ler("2000000010000", ConfiguracaoEtiqueta.padrao())).isEmpty();
    }

    @Test
    void valorZeroELido() {
        assertThat(LeitorEtiquetaBalanca.ler("2000542000000", ConfiguracaoEtiqueta.padrao()))
                .contains(new LeituraEtiqueta(542, TipoInformacaoEtiqueta.VALOR, new BigDecimal("0.000")));
    }
}
