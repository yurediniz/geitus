package com.geitus.app.shared.validation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Testa a validacao de CPF e CNPJ pelos digitos verificadores e a normalizacao
 * para somente digitos.
 */
class DocumentosTest {

    @Test
    void cpfValidoAceitaComEsemMascara() {
        assertThat(Documentos.cpfValido("11144477735")).isTrue();
        assertThat(Documentos.cpfValido("111.444.777-35")).isTrue();
    }

    @Test
    void cpfInvalidoRejeitaDigitoVerificadorErrado() {
        assertThat(Documentos.cpfValido("11144477700")).isFalse();
        assertThat(Documentos.cpfValido("12345678900")).isFalse();
    }

    @Test
    void cpfInvalidoRejeitaTamanhoErradoNuloEsequenciaRepetida() {
        assertThat(Documentos.cpfValido(null)).isFalse();
        assertThat(Documentos.cpfValido("123")).isFalse();
        assertThat(Documentos.cpfValido("00000000000")).isFalse();
        assertThat(Documentos.cpfValido("11111111111")).isFalse();
    }

    @Test
    void cnpjValidoAceitaComEsemMascara() {
        assertThat(Documentos.cnpjValido("11222333000181")).isTrue();
        assertThat(Documentos.cnpjValido("11.222.333/0001-81")).isTrue();
    }

    @Test
    void cnpjInvalidoRejeitaDigitoVerificadorErradoTamanhoEsequencia() {
        assertThat(Documentos.cnpjValido("11222333000100")).isFalse();
        assertThat(Documentos.cnpjValido(null)).isFalse();
        assertThat(Documentos.cnpjValido("123")).isFalse();
        assertThat(Documentos.cnpjValido("00000000000000")).isFalse();
    }

    @Test
    void somenteDigitosRemoveMascaraEpreservaNulo() {
        assertThat(Documentos.somenteDigitos("111.444.777-35")).isEqualTo("11144477735");
        assertThat(Documentos.somenteDigitos(null)).isNull();
        assertThat(Documentos.somenteDigitos("abc")).isEmpty();
    }
}
