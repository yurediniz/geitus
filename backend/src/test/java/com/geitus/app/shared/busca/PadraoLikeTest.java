package com.geitus.app.shared.busca;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PadraoLikeTest {

    @Test
    void curingasEEscapeViramLiterais() {
        assertThat(PadraoLike.contem("100%")).isEqualTo("%100\\%%");
        assertThat(PadraoLike.contem("a_b")).isEqualTo("%a\\_b%");
        assertThat(PadraoLike.contem("c:\\x")).isEqualTo("%c:\\\\x%");
        // A barra do termo e escapada antes dos curingas: nao ha escape duplo.
        assertThat(PadraoLike.contem("\\%")).isEqualTo("%\\\\\\%%");
    }

    @Test
    void termoVazioCasaComQualquerTexto() {
        assertThat(PadraoLike.contem("")).isEqualTo("%%");
    }
}
