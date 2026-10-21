package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

/**
 * Regra pura do codigo de barras (spec 4.3): normalizacao, candidato GS1,
 * digito verificador mod 10 e formato pelo conteudo. Os mesmos casos sao
 * usados no {@code codigoBarras.test.ts} do frontend.
 */
class CodigoBarrasTest {

    @ParameterizedTest
    @CsvSource({
            "7891000315507, EAN13",
            "96385074, EAN8",
            "036000291452, UPCA"
    })
    void codigoGs1ValidoRecebeOFormatoPeloTamanho(String codigo, FormatoCodigoBarras formato) {
        assertThat(CodigoBarras.ehCandidatoGs1(codigo)).isTrue();
        assertThat(CodigoBarras.digitoVerificadorValido(codigo)).isTrue();
        assertThat(CodigoBarras.detectarFormato(codigo)).isEqualTo(formato);
    }

    @ParameterizedTest
    @ValueSource(strings = {"7891000315508", "96385075", "036000291453"})
    void candidatoGs1ComDigitoTrocadoEInvalidoEFicaComoOutro(String codigo) {
        assertThat(CodigoBarras.ehCandidatoGs1(codigo)).isTrue();
        assertThat(CodigoBarras.digitoVerificadorValido(codigo)).isFalse();
        assertThat(CodigoBarras.detectarFormato(codigo)).isEqualTo(FormatoCodigoBarras.OUTRO);
    }

    @ParameterizedTest
    @ValueSource(strings = {"12345678901234", "123456789", "ABC123", "7891000A15507"})
    void tamanhoForaDoGs1OuComLetrasEOutroSemSerCandidato(String codigo) {
        assertThat(CodigoBarras.ehCandidatoGs1(codigo)).isFalse();
        assertThat(CodigoBarras.detectarFormato(codigo)).isEqualTo(FormatoCodigoBarras.OUTRO);
    }

    @Test
    void normalizarRemoveTodoEspacoEmBrancoInclusiveInterno() {
        assertThat(CodigoBarras.normalizar(" 7891 000315507\n")).isEqualTo("7891000315507");
        assertThat(CodigoBarras.normalizar("\t789 1000315507 ")).isEqualTo("7891000315507");
    }

    @Test
    void normalizarVazioOuSoEspacosDevolveNulo() {
        assertThat(CodigoBarras.normalizar("  ")).isNull();
        assertThat(CodigoBarras.normalizar("")).isNull();
        assertThat(CodigoBarras.normalizar(null)).isNull();
    }

    @Test
    void digitoVerificadorDeTextoQueNaoESoDigitosEFalso() {
        assertThat(CodigoBarras.digitoVerificadorValido("ABC")).isFalse();
        assertThat(CodigoBarras.digitoVerificadorValido("")).isFalse();
    }
}
