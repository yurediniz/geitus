package com.geitus.app.catalog.imagem;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * Validacao fail-fast do segredo das URLs de imagem (docs/modules/produtos-imagem.md,
 * 4.2 e 8): sem ele, curto ou igual ao do JWT, a aplicacao nao sobe, e a
 * mensagem nunca mostra o valor.
 */
class SegredoDeImagemValidatorTest {

    private static final String SEGREDO_DO_JWT = "segredo-de-teste-apenas-para-os-testes-do-geitus-1234567890";

    @Test
    void ausenteImpedeASubida() {
        assertThatThrownBy(() -> new SegredoDeImagemValidator("", SEGREDO_DO_JWT).afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("GEITUS_IMAGEM_SEGREDO");
        assertThatThrownBy(() -> new SegredoDeImagemValidator(null, SEGREDO_DO_JWT).afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("GEITUS_IMAGEM_SEGREDO");
        assertThatThrownBy(() -> new SegredoDeImagemValidator("   ", SEGREDO_DO_JWT).afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void curtoImpedeASubidaSemMostrarOValor() {
        String curto = "segredo-curto-de-31-bytes-12345";

        assertThatThrownBy(() -> new SegredoDeImagemValidator(curto, SEGREDO_DO_JWT).afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32 bytes")
                .hasMessageNotContaining(curto);
    }

    /** Spec 4.2: o segredo das imagens e diferente do JWT_SECRET. */
    @Test
    void igualAoDoJwtImpedeASubidaSemMostrarOValor() {
        assertThatThrownBy(() -> new SegredoDeImagemValidator(SEGREDO_DO_JWT, SEGREDO_DO_JWT).afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET")
                .hasMessageNotContaining(SEGREDO_DO_JWT);
    }

    @Test
    void comPeloMenos32BytesEDiferenteDoJwtSobe() {
        assertThatCode(() -> new SegredoDeImagemValidator("segredo-de-teste-de-32-bytes-123", SEGREDO_DO_JWT)
                .afterPropertiesSet()).doesNotThrowAnyException();
    }
}
