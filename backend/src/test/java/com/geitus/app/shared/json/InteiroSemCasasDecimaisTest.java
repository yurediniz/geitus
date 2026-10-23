package com.geitus.app.shared.json;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;

/**
 * Inteiro lido do JSON sem perder casas em silencio: {@code 542.9} nao vira
 * {@code 542} (o Jackson, por padrao, trunca), e texto so com digitos (inclusive
 * com zeros a esquerda) continua aceito.
 */
class InteiroSemCasasDecimaisTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private record Corpo(@JsonDeserialize(using = InteiroSemCasasDecimais.class) Integer codigo) {
    }

    private Integer ler(String valor) throws Exception {
        return mapper.readValue("{ \"codigo\": " + valor + " }", Corpo.class).codigo();
    }

    @Test
    void inteiroETextoDeDigitosSaoAceitos() throws Exception {
        assertThat(ler("542")).isEqualTo(542);
        assertThat(ler("\"000542\"")).isEqualTo(542);
        assertThat(ler("\" 542 \"")).isEqualTo(542);
        assertThat(ler("-1")).isEqualTo(-1);
        assertThat(ler("2147483647")).isEqualTo(Integer.MAX_VALUE);
    }

    @Test
    void nuloEVazioSaoNulo() throws Exception {
        assertThat(ler("null")).isNull();
        assertThat(ler("\"\"")).isNull();
        assertThat(mapper.readValue("{}", Corpo.class).codigo()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = { "542.9", "542.0", "1e3", "\"542.9\"", "\"54a\"", "2147483648", "\"99999999999\"",
            "true", "[542]", "{}" })
    void decimalTextoNaoNumericoOuForaDoIntervaloSaoRecusados(String valor) {
        assertThatThrownBy(() -> ler(valor)).isInstanceOf(MismatchedInputException.class);
    }
}
