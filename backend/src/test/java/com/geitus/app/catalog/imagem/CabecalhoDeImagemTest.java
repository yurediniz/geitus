package com.geitus.app.catalog.imagem;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;

import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.imagem.CabecalhoDeImagem.Leitura;

/**
 * Leitor de cabecalho (docs/modules/produtos-imagem.md, 4.1 e 8): o tipo real
 * pelos primeiros bytes e as dimensoes pelo SOF do JPEG ou pelos blocos do
 * WebP, sem biblioteca nova. Os bytes sao montados no teste.
 */
class CabecalhoDeImagemTest {

    private static final String DIMENSOES_ILEGIVEIS = "Não foi possível ler as dimensões da imagem.";

    // ---------- JPEG ----------

    @Test
    void jpegBaselineTemAsDimensoesDoSof0() {
        assertThat(CabecalhoDeImagem.ler(ImagensDeTeste.jpeg(ImagensDeTeste.SOF0, 1200, 800)))
                .contains(new Leitura(TipoDeImagem.JPEG, 1200, 800));
    }

    @Test
    void jpegProgressivoTemAsDimensoesDoSof2() {
        assertThat(CabecalhoDeImagem.ler(ImagensDeTeste.jpeg(ImagensDeTeste.SOF2, 640, 480)))
                .contains(new Leitura(TipoDeImagem.JPEG, 640, 480));
    }

    @Test
    void jpegSemSofEIlegivel() {
        assertThatThrownBy(() -> CabecalhoDeImagem.ler(ImagensDeTeste.jpegSemSof()))
                .isInstanceOf(ImagemInvalidaException.class)
                .hasMessage(DIMENSOES_ILEGIVEIS);
    }

    @Test
    void jpegTruncadoNoMeioDoMarcadorEIlegivel() {
        byte[] jpeg = ImagensDeTeste.jpeg(ImagensDeTeste.SOF0, 1200, 800);

        assertThatThrownBy(() -> CabecalhoDeImagem.ler(Arrays.copyOf(jpeg, 10)))
                .isInstanceOf(ImagemInvalidaException.class)
                .hasMessage(DIMENSOES_ILEGIVEIS);
        assertThatThrownBy(() -> CabecalhoDeImagem.ler(Arrays.copyOf(jpeg, 25)))
                .isInstanceOf(ImagemInvalidaException.class)
                .hasMessage(DIMENSOES_ILEGIVEIS);
        assertThatThrownBy(() -> CabecalhoDeImagem.ler(Arrays.copyOf(jpeg, 3)))
                .isInstanceOf(ImagemInvalidaException.class)
                .hasMessage(DIMENSOES_ILEGIVEIS);
    }

    @Test
    void jpegComDimensaoZeroEIlegivel() {
        assertThatThrownBy(() -> CabecalhoDeImagem.ler(ImagensDeTeste.jpeg(ImagensDeTeste.SOF0, 0, 800)))
                .isInstanceOf(ImagemInvalidaException.class)
                .hasMessage(DIMENSOES_ILEGIVEIS);
    }

    // ---------- WebP ----------

    @Test
    void webpComPerdasLeOBlocoVp8() {
        assertThat(CabecalhoDeImagem.ler(ImagensDeTeste.webpVp8(200, 150)))
                .contains(new Leitura(TipoDeImagem.WEBP, 200, 150));
    }

    @Test
    void webpSemPerdasLeOBlocoVp8l() {
        assertThat(CabecalhoDeImagem.ler(ImagensDeTeste.webpVp8l(1, 1)))
                .contains(new Leitura(TipoDeImagem.WEBP, 1, 1));
        assertThat(CabecalhoDeImagem.ler(ImagensDeTeste.webpVp8l(1200, 900)))
                .contains(new Leitura(TipoDeImagem.WEBP, 1200, 900));
    }

    @Test
    void webpEstendidoLeOBlocoVp8x() {
        assertThat(CabecalhoDeImagem.ler(ImagensDeTeste.webpVp8x(1000, 1000)))
                .contains(new Leitura(TipoDeImagem.WEBP, 1000, 1000));
    }

    /** Review Focus 1: RIFF/WEBP corretos, mas um bloco desconhecido. */
    @Test
    void webpComBlocoDesconhecidoEIlegivel() {
        assertThatThrownBy(() -> CabecalhoDeImagem.ler(ImagensDeTeste.webpComBloco("ABCD")))
                .isInstanceOf(ImagemInvalidaException.class)
                .hasMessage(DIMENSOES_ILEGIVEIS);
    }

    @Test
    void webpTruncadoEIlegivel() {
        assertThatThrownBy(() -> CabecalhoDeImagem.ler(Arrays.copyOf(ImagensDeTeste.webpVp8(200, 150), 27)))
                .isInstanceOf(ImagemInvalidaException.class)
                .hasMessage(DIMENSOES_ILEGIVEIS);
        assertThatThrownBy(() -> CabecalhoDeImagem.ler(Arrays.copyOf(ImagensDeTeste.webpVp8x(10, 10), 14)))
                .isInstanceOf(ImagemInvalidaException.class)
                .hasMessage(DIMENSOES_ILEGIVEIS);
    }

    @Test
    void webpVp8SemAssinaturaDoQuadroEIlegivel() {
        byte[] webp = ImagensDeTeste.webpVp8(200, 150);
        webp[23] = 0;

        assertThatThrownBy(() -> CabecalhoDeImagem.ler(webp))
                .isInstanceOf(ImagemInvalidaException.class)
                .hasMessage(DIMENSOES_ILEGIVEIS);
    }

    // ---------- Formatos recusados ----------

    @Test
    void outrosFormatosNaoSaoReconhecidos() {
        assertThat(CabecalhoDeImagem.ler(ImagensDeTeste.png())).isEmpty();
        assertThat(CabecalhoDeImagem.ler(ImagensDeTeste.gif())).isEmpty();
        assertThat(CabecalhoDeImagem.ler(ImagensDeTeste.svg())).isEmpty();
        assertThat(CabecalhoDeImagem.ler(ImagensDeTeste.texto())).isEmpty();
        assertThat(CabecalhoDeImagem.ler(new byte[0])).isEmpty();
        assertThat(CabecalhoDeImagem.ler(null)).isEmpty();
    }

    @Test
    void tipoDeVemSoDosPrimeirosBytes() {
        assertThat(CabecalhoDeImagem.tipoDe(ImagensDeTeste.jpegSemSof())).contains(TipoDeImagem.JPEG);
        assertThat(CabecalhoDeImagem.tipoDe(ImagensDeTeste.webpComBloco("ABCD"))).contains(TipoDeImagem.WEBP);
        assertThat(CabecalhoDeImagem.tipoDe(ImagensDeTeste.svg())).isEmpty();
        assertThat(CabecalhoDeImagem.tipoDe(new byte[] {(byte) 0xFF, (byte) 0xD8})).isEmpty();
    }

    @Test
    void tipoDeImagemTemOMimeGravado() {
        assertThat(TipoDeImagem.WEBP.mime()).isEqualTo("image/webp");
        assertThat(TipoDeImagem.JPEG.mime()).isEqualTo("image/jpeg");
        assertThat(TipoDeImagem.doMime("image/jpeg")).isEqualTo(TipoDeImagem.JPEG);
        assertThatThrownBy(() -> TipoDeImagem.doMime("image/png")).isInstanceOf(IllegalArgumentException.class);
    }
}
