package com.geitus.app.company.validation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Testa a validacao de telefones BR (fixo e celular, com DDD valido).
 */
class TelefonesTest {

    @Test
    void aceitaFixo10EceLular11DigitosComEsemMascara() {
        assertThat(Telefones.valido("1133224455")).isTrue();
        assertThat(Telefones.valido("11987654321")).isTrue();
        assertThat(Telefones.valido("(11) 98765-4321")).isTrue();
    }

    @Test
    void rejeitaTamanhoErradoDddInvalidoEnulo() {
        assertThat(Telefones.valido(null)).isFalse();
        assertThat(Telefones.valido("123")).isFalse();
        assertThat(Telefones.valido("999999999999")).isFalse();
        // DDD 10 e invalido (menor que 11)
        assertThat(Telefones.valido("1099999999")).isFalse();
    }
}
