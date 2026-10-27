package com.geitus.app.catalog.imagem;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Validacao fail-fast do segredo das URLs de imagem (docs/modules/produtos.md):
 * sem ele, curto ou igual ao do JWT, a aplicacao nao sobe, e a
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

    /** Spec de Produtos: o segredo das imagens e diferente do JWT_SECRET. */
    @Test
    void igualAoDoJwtImpedeASubidaSemMostrarOValor() {
        assertThatThrownBy(() -> new SegredoDeImagemValidator(SEGREDO_DO_JWT, SEGREDO_DO_JWT).afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET")
                .hasMessageNotContaining(SEGREDO_DO_JWT);
    }

    /** O valor de exemplo do .env.example e publico: copiado para producao, qualquer um assinaria URLs. */
    @Test
    void valorDeExemploDoEnvExampleImpedeASubidaSemMostrarOValor() {
        String exemplo = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        assertThatThrownBy(() -> new SegredoDeImagemValidator(exemplo, SEGREDO_DO_JWT).afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(".env.example")
                .hasMessageNotContaining(exemplo);
    }

    /** O valor recusado e o mesmo do .env.example da raiz: os dois nao podem divergir. */
    @Test
    void valorRecusadoEOMesmoDoEnvExample() throws IOException {
        List<String> linhas = Files.readAllLines(Path.of("..", ".env.example"), StandardCharsets.UTF_8);

        assertThat(linhas).contains("GEITUS_IMAGEM_SEGREDO=" + SegredoDeImagemValidator.SEGREDO_DE_EXEMPLO);
    }

    @Test
    void comPeloMenos32BytesEDiferenteDoJwtSobe() {
        assertThatCode(() -> new SegredoDeImagemValidator("segredo-de-teste-de-32-bytes-123", SEGREDO_DO_JWT)
                .afterPropertiesSet()).doesNotThrowAnyException();
    }
}
