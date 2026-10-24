package com.geitus.app.iam;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

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

    /**
     * Os valores de exemplo do .env.example e da documentacao sao publicos: copiados
     * para producao, qualquer um assinaria tokens. A mensagem nunca mostra o valor.
     */
    @ParameterizedTest
    @ValueSource(strings = {
            "defina-um-segredo-forte-com-no-minimo-32-bytes",
            "um-segredo-forte-com-no-minimo-32-bytes-aqui" })
    void deveFalharComSegredoDeExemploSemMostrarOValor(String exemplo) {
        JwtSecretValidator validator = new JwtSecretValidator(exemplo);

        assertThatThrownBy(validator::afterPropertiesSet)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET")
                .hasMessageContaining(".env.example")
                .hasMessageNotContaining(exemplo);
    }

    /** O valor recusado e o mesmo do .env.example da raiz: os dois nao podem divergir. */
    @Test
    void segredoDeExemploRecusadoEOMesmoDoEnvExample() throws IOException {
        List<String> linhas = Files.readAllLines(Path.of("..", ".env.example"), StandardCharsets.UTF_8);

        assertThat(linhas).contains("JWT_SECRET=" + JwtSecretValidator.SEGREDO_DO_ENV_EXAMPLE);
    }

    @Test
    void deveAceitarSegredoComPeloMenos32Bytes() {
        JwtSecretValidator validator = new JwtSecretValidator(
                "segredo-de-teste-apenas-para-os-testes-do-geitus-1234567890");

        assertThatCode(validator::afterPropertiesSet).doesNotThrowAnyException();
    }
}
