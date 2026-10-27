package com.geitus.app.catalog.balanca;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.geitus.app.catalog.RegraDeNegocioException;

/**
 * Regras da configuracao da etiqueta (docs/modules/produtos.md).
 * Duas camadas:
 * <ul>
 *   <li>{@link ConfiguracaoEtiqueta#validada}: o que vem da tela, com as mensagens
 *       de usuario (400 com o campo; a soma de 13 digitos com a mensagem da spec);</li>
 *   <li>o construtor do record: invariantes (prefixo e intervalos) com
 *       {@link IllegalArgumentException}, para o leitor nunca receber um valor
 *       impossivel (nem dar NPE).</li>
 * </ul>
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
        assertThat(ConfiguracaoEtiqueta.validada("2", 4, 1, TipoInformacaoEtiqueta.VALOR, 6, 2, true))
                .isEqualTo(new ConfiguracaoEtiqueta("2", 4, 1, TipoInformacaoEtiqueta.VALOR, 6, 2, true));
        assertThatCode(() -> ConfiguracaoEtiqueta.validada("2", 5, 1, TipoInformacaoEtiqueta.VALOR, 5, 2, true))
                .doesNotThrowAnyException();
        assertThatCode(() -> ConfiguracaoEtiqueta.validada("2", 6, 0, TipoInformacaoEtiqueta.PESO, 5, 3, true))
                .doesNotThrowAnyException();
        assertThatCode(() -> ConfiguracaoEtiqueta.validada("20", 5, 0, TipoInformacaoEtiqueta.VALOR, 5, 2, true))
                .doesNotThrowAnyException();
    }

    // ---------- Mensagens de usuario (validada) ----------

    @Test
    void somaDiferenteDe13_400() {
        assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, true))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A etiqueta precisa ter 13 dígitos no total (hoje: 14).");
        assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada("2", 4, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A etiqueta precisa ter 13 dígitos no total (hoje: 11).");
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", 4, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false)
                .validar())
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A etiqueta precisa ter 13 dígitos no total (hoje: 11).");
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "a", "123", " 2", "2a", "²", "２" })
    void prefixoInvalido_400(String prefixo) {
        assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada(prefixo, 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3,
                false))
                .satisfies(erro -> noCampo(erro, "prefixo", "O prefixo deve ter 1 ou 2 dígitos."));
    }

    @Test
    void digitosDoCodigoForaDe4A6_400() {
        for (int digitos : new int[] { 3, 7 }) {
            assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada("2", digitos, 0, TipoInformacaoEtiqueta.VALOR, 6,
                    3, false))
                    .satisfies(erro -> noCampo(erro, "digitosCodigo",
                            "O código do produto na etiqueta deve ter de 4 a 6 dígitos."));
        }
    }

    @Test
    void preenchimentoForaDe0A2_400() {
        for (int digitos : new int[] { -1, 3 }) {
            assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada("2", 4, digitos, TipoInformacaoEtiqueta.VALOR, 6,
                    3, false))
                    .satisfies(erro -> noCampo(erro, "digitosPreenchimento",
                            "O preenchimento deve ter de 0 a 2 dígitos."));
        }
    }

    @Test
    void digitosDaInformacaoForaDe4A7_400() {
        for (int digitos : new int[] { 3, 8 }) {
            assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada("2", 6, 0, TipoInformacaoEtiqueta.VALOR, digitos,
                    3, false))
                    .satisfies(erro -> noCampo(erro, "digitosInformacao",
                            "O valor ou o peso deve ter de 4 a 7 dígitos."));
        }
    }

    @Test
    void casasDecimaisForaDe2A3_400() {
        for (int casas : new int[] { 1, 4 }) {
            assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, casas,
                    false))
                    .satisfies(erro -> noCampo(erro, "casasDecimais", "As casas decimais devem ser 2 ou 3."));
        }
    }

    /** Campo ausente (chamada sem {@code @Valid}) vira 400 com o campo, nunca NPE ao desembrulhar. */
    @Test
    void camposAusentes_400ComOCampo() {
        assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada(null, 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false))
                .satisfies(erro -> noCampo(erro, "prefixo", "O prefixo deve ter 1 ou 2 dígitos."));
        assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada("2", null, 0, TipoInformacaoEtiqueta.VALOR, 6, 3,
                false))
                .satisfies(erro -> noCampo(erro, "digitosCodigo",
                        "O código do produto na etiqueta deve ter de 4 a 6 dígitos."));
        assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada("2", 6, null, TipoInformacaoEtiqueta.VALOR, 6, 3,
                false))
                .satisfies(erro -> noCampo(erro, "digitosPreenchimento",
                        "O preenchimento deve ter de 0 a 2 dígitos."));
        assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada("2", 6, 0, null, 6, 3, false))
                .satisfies(erro -> noCampo(erro, "tipoInformacao", "Informe se a etiqueta traz o valor ou o peso."));
        assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada("2", 6, 0, TipoInformacaoEtiqueta.VALOR, null, 3,
                false))
                .satisfies(erro -> noCampo(erro, "digitosInformacao",
                        "O valor ou o peso deve ter de 4 a 7 dígitos."));
        assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, null,
                false))
                .satisfies(erro -> noCampo(erro, "casasDecimais", "As casas decimais devem ser 2 ou 3."));
        assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, null))
                .satisfies(erro -> noCampo(erro, "digitoVerificador",
                        "Informe se a etiqueta tem dígito verificador."));
    }

    /** Os intervalos vem antes da soma: o usuario corrige o campo errado primeiro. */
    @Test
    void intervaloAntesDaSoma() {
        assertThatThrownBy(() -> ConfiguracaoEtiqueta.validada("2", 9, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false))
                .satisfies(erro -> noCampo(erro, "digitosCodigo",
                        "O código do produto na etiqueta deve ter de 4 a 6 dígitos."));
    }

    // ---------- Invariantes do record (construtor) ----------

    @Test
    void construtorRecusaValoresImpossiveis() {
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta(null, 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2a", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta("123", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", 7, 0, TipoInformacaoEtiqueta.VALOR, 5, 3, false))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", 4, 3, TipoInformacaoEtiqueta.VALOR, 5, 3, false))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", 6, 0, null, 6, 3, false))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 8, 3, false))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ConfiguracaoEtiqueta("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 1, false))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static void noCampo(Throwable erro, String campo, String mensagem) {
        assertThat(erro).isInstanceOf(RegraDeNegocioException.class).hasMessage(mensagem);
        assertThat(((RegraDeNegocioException) erro).campo()).contains(campo);
    }
}
