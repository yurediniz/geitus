package com.upeflow.erpell.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * Testa a validacao fail-fast do segredo JWT.
 */
class JwtSecretValidatorTest {

    @Test
    void deveFalharQuandoSegredoAusente() {
        JwtSecretValidator validator = new JwtSecretValidator("");

        assertThatThrownBy(validator::afterPropertiesSet)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET");
    }

    @Test
    void deveFalharQuandoSegredoNulo() {
        JwtSecretValidator validator = new JwtSecretValidator(null);

        assertThatThrownBy(validator::afterPropertiesSet)
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void deveFalharQuandoSegredoMenorQue32Bytes() {
        JwtSecretValidator validator = new JwtSecretValidator("curto-demais"); // < 32 bytes

        assertThatThrownBy(validator::afterPropertiesSet)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("256 bits");
    }

    @Test
    void deveAceitarSegredoComPeloMenos32Bytes() {
        JwtSecretValidator validator = new JwtSecretValidator(
                "segredo-de-teste-apenas-para-os-testes-do-erpell-1234567890");

        assertThatCode(validator::afterPropertiesSet).doesNotThrowAnyException();
    }
}
