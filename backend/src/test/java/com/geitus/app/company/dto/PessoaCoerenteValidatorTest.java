package com.geitus.app.company.dto;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Testa a regra pura de coerencia PJ/PF usada pela anotacao {@code @PessoaCoerente}
 * e revalidada no {@code EmpresaService}.
 */
class PessoaCoerenteValidatorTest {

    @Test
    void juridicaExigeCnpjErazaoSocial() {
        assertThat(PessoaCoerenteValidator.coerente("JURIDICA", "11222333000181", "Empresa X")).isTrue();
        assertThat(PessoaCoerenteValidator.coerente("JURIDICA", null, "Empresa X")).isFalse();
        assertThat(PessoaCoerenteValidator.coerente("JURIDICA", "11222333000181", null)).isFalse();
        assertThat(PessoaCoerenteValidator.coerente("JURIDICA", "  ", "  ")).isFalse();
    }

    @Test
    void fisicaNaoPodeTerCnpj() {
        assertThat(PessoaCoerenteValidator.coerente("FISICA", null, null)).isTrue();
        assertThat(PessoaCoerenteValidator.coerente("FISICA", "11222333000181", null)).isFalse();
    }

    @Test
    void tipoInvalidoDefereParaOutrasValidacoes() {
        assertThat(PessoaCoerenteValidator.coerente("OUTRO", null, null)).isTrue();
        assertThat(PessoaCoerenteValidator.coerente(null, null, null)).isTrue();
    }
}
