package com.geitus.app.catalog.imagem;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * Conferencias do servidor na ordem da tabela da spec
 * (docs/modules/produtos-imagem.md, 4.1): partes, tipo real e o mesmo nas
 * duas, bytes, dimensoes legiveis e o maior lado. Cada caso tambem viola as
 * conferencias seguintes, para provar a ordem.
 */
class ConferenciaDaImagemTest {

    private static final byte[] GRANDE_VALIDA = ImagensDeTeste.webpVp8(1200, 900);
    private static final byte[] MINIATURA_VALIDA = ImagensDeTeste.webpVp8(200, 150);

    @Test
    void imagemValidaSaiComOTipoEAsDimensoesDasDuasVersoes() {
        ImagemConferida conferida = ConferenciaDaImagem.conferir(GRANDE_VALIDA, MINIATURA_VALIDA);

        assertThat(conferida.tipo()).isEqualTo(TipoDeImagem.WEBP);
        assertThat(conferida.grande().bytes()).isEqualTo(GRANDE_VALIDA);
        assertThat(conferida.grande().largura()).isEqualTo(1200);
        assertThat(conferida.grande().altura()).isEqualTo(900);
        assertThat(conferida.miniatura().largura()).isEqualTo(200);
        assertThat(conferida.miniatura().altura()).isEqualTo(150);
    }

    @Test
    void jpegNasDuasVersoesNosLimitesExatos() {
        byte[] grande = ImagensDeTeste.comTamanho(ImagensDeTeste.jpeg(ImagensDeTeste.SOF0, 900, 1200), 409_600);
        byte[] miniatura = ImagensDeTeste.comTamanho(ImagensDeTeste.jpeg(ImagensDeTeste.SOF2, 150, 200), 40_960);

        assertThat(ConferenciaDaImagem.conferir(grande, miniatura).tipo()).isEqualTo(TipoDeImagem.JPEG);
    }

    @Test
    void faltaUmaDasPartes() {
        assertRecusada(null, ImagensDeTeste.png(), "Envie a imagem grande e a miniatura.");
        assertRecusada(GRANDE_VALIDA, new byte[0], "Envie a imagem grande e a miniatura.");
    }

    /** Review Focus 1: SVG ou HTML com extensao .jpg e recusado pelo tipo real. */
    @Test
    void formatoForaDeWebpEJpegVemAntesDoTamanho() {
        String mensagem = "Formato de imagem não aceito. Use WebP ou JPEG.";
        assertRecusada(ImagensDeTeste.comTamanho(ImagensDeTeste.png(), 500_000), MINIATURA_VALIDA, mensagem);
        assertRecusada(GRANDE_VALIDA, ImagensDeTeste.svg(), mensagem);
        assertRecusada(ImagensDeTeste.gif(), MINIATURA_VALIDA, mensagem);
        assertRecusada(ImagensDeTeste.texto(), MINIATURA_VALIDA, mensagem);
    }

    @Test
    void tiposDiferentesNasDuasPartes() {
        assertRecusada(GRANDE_VALIDA, ImagensDeTeste.jpeg(ImagensDeTeste.SOF0, 200, 150),
                "Formato de imagem não aceito. Use WebP ou JPEG.");
    }

    @Test
    void bytesAcimaDoLimiteVemAntesDasDimensoes() {
        byte[] grandeIlegivel = ImagensDeTeste.comTamanho(ImagensDeTeste.webpComBloco("ABCD"), 409_601);
        assertRecusada(grandeIlegivel, MINIATURA_VALIDA, "A imagem grande deve ter no máximo 400 KB.");
        assertRecusada(GRANDE_VALIDA, ImagensDeTeste.comTamanho(ImagensDeTeste.webpVp8(201, 150), 40_961),
                "A miniatura deve ter no máximo 40 KB.");
    }

    @Test
    void dimensoesIlegiveisVemAntesDoMaiorLado() {
        assertRecusada(ImagensDeTeste.webpComBloco("ABCD"), ImagensDeTeste.webpVp8(201, 150),
                "Não foi possível ler as dimensões da imagem.");
        assertRecusada(ImagensDeTeste.webpVp8(1201, 900), ImagensDeTeste.webpComBloco("ABCD"),
                "Não foi possível ler as dimensões da imagem.");
    }

    @Test
    void maiorLadoAcimaDoLimite() {
        assertRecusada(ImagensDeTeste.webpVp8(900, 1201), MINIATURA_VALIDA,
                "A imagem grande deve ter no máximo 1200 px no maior lado.");
        assertRecusada(GRANDE_VALIDA, ImagensDeTeste.webpVp8l(150, 201),
                "A miniatura deve ter no máximo 200 px no maior lado.");
    }

    private static void assertRecusada(byte[] grande, byte[] miniatura, String mensagem) {
        assertThatThrownBy(() -> ConferenciaDaImagem.conferir(grande, miniatura))
                .isInstanceOf(ImagemInvalidaException.class)
                .hasMessage(mensagem);
    }
}
