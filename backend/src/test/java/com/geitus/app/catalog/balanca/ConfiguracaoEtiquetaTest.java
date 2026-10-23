package com.geitus.app.catalog.balanca;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Regras da configuracao da etiqueta (docs/modules/produtos-codigo-e-balanca.md,
 * 3.1): intervalos de cada campo (400 com o campo) e soma de 13 digitos (400
 * com a mensagem da spec).
 */
class ConfiguracaoEtiquetaTest {

    @Test
    void padraoValido() {
        ConfiguracaoEtiqueta padrao = ConfiguracaoEtiqueta.padrao();

        assertThat(padrao).isEqualTo(new ConfiguracaoEtiqueta("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false));
        assertThat(padrao.tamanhoTotal()).isEqualTo(13);
        assertThatCode(padrao::validar).doesNotThrowAnyException();
    }

    @Test
    void modelosProntosValidos() {
        assertThatCode(() -> new ConfiguracaoEtiqueta("2", 4, 1, TipoInformacaoEtiqueta.VALOR, 6, 2, true).validar())
                .doesNotThrowAnyException();
        assertThatCode(() -> new ConfiguracaoEtiqueta("2", 5, 1, TipoInformacaoEtiqueta.VALOR, 5, 2, true).validar())
                .doesNotThrowAnyException();
        assertThatCode(() -> new ConfiguracaoEtiqueta("2", 6, 0, TipoInformacaoEtiqueta.PESO, 5, 3, true).validar())
                .doesNotThrowAnyException();
    }

    @Test
    void somaDiferenteDe13_400() {
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, true)
                .validar())
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A etiqueta precisa ter 13 dígitos no total (hoje: 14).");
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", 4, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false)
                .validar())
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A etiqueta precisa ter 13 dígitos no total (hoje: 11).");
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "a", "123", " 2", "2a", "²" })
    void prefixoInvalido_400(String prefixo) {
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta(prefixo, 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false)
                .validar())
                .satisfies(erro -> noCampo(erro, "prefixo", "O prefixo deve ter 1 ou 2 dígitos."));
    }

    @Test
    void prefixoNulo_400() {
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta(null, 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false)
                .validar())
                .satisfies(erro -> noCampo(erro, "prefixo", "O prefixo deve ter 1 ou 2 dígitos."));
    }

    @Test
    void digitosDoCodigoForaDe4A6_400() {
        for (int digitos : new int[] { 3, 7 }) {
            assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", digitos, 0, TipoInformacaoEtiqueta.VALOR, 6, 3,
                    false).validar())
                    .satisfies(erro -> noCampo(erro, "digitosCodigo", "O código deve ter de 4 a 6 dígitos."));
        }
    }

    @Test
    void preenchimentoForaDe0A2_400() {
        for (int digitos : new int[] { -1, 3 }) {
            assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", 4, digitos, TipoInformacaoEtiqueta.VALOR, 6, 3,
                    false).validar())
                    .satisfies(erro -> noCampo(erro, "digitosPreenchimento",
                            "O preenchimento deve ter de 0 a 2 dígitos."));
        }
    }

    @Test
    void tipoDeInformacaoAusente_400() {
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", 6, 0, null, 6, 3, false).validar())
                .satisfies(erro -> noCampo(erro, "tipoInformacao", "Informe se a etiqueta traz o valor ou o peso."));
    }

    @Test
    void digitosDaInformacaoForaDe4A7_400() {
        for (int digitos : new int[] { 3, 8 }) {
            assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", 6, 0, TipoInformacaoEtiqueta.VALOR, digitos, 3,
                    false).validar())
                    .satisfies(erro -> noCampo(erro, "digitosInformacao",
                            "A informação deve ter de 4 a 7 dígitos."));
        }
    }

    @Test
    void casasDecimaisForaDe2A3_400() {
        for (int casas : new int[] { 1, 4 }) {
            assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, casas,
                    false).validar())
                    .satisfies(erro -> noCampo(erro, "casasDecimais", "As casas decimais devem ser 2 ou 3."));
        }
    }

    /** Os intervalos vem antes da soma: o usuario corrige o campo errado primeiro. */
    @Test
    void intervaloAntesDaSoma() {
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", 9, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false)
                .validar())
                .satisfies(erro -> noCampo(erro, "digitosCodigo", "O código deve ter de 4 a 6 dígitos."));
    }

    private static void noCampo(Throwable erro, String campo, String mensagem) {
        assertThat(erro).isInstanceOf(RegraDeNegocioException.class).hasMessage(mensagem);
        assertThat(((RegraDeNegocioException) erro).campo()).contains(campo);
    }
}
