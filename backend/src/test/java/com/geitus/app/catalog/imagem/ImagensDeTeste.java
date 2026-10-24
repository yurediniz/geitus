package com.geitus.app.catalog.imagem;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Monta, nos testes, os bytes minimos de cada formato (so o cabecalho que o
 * {@link CabecalhoDeImagem} le), sem arquivos binarios no repositorio. Publica
 * para os testes de outros pacotes do catalogo (a listagem com imagens).
 */
public final class ImagensDeTeste {

    public static final int SOF0 = 0xC0;
    public static final int SOF2 = 0xC2;

    private ImagensDeTeste() {
    }

    /** JPEG com APP0 (JFIF), o SOF informado com as dimensoes e o fim (EOI). */
    public static byte[] jpeg(int marcadorSof, int largura, int altura) {
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        escrever(saida, 0xFF, 0xD8);
        escrever(saida, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
                0x00, 0x00);
        escrever(saida, 0xFF, marcadorSof, 0x00, 0x11, 0x08, altura >> 8, altura & 0xFF, largura >> 8,
                largura & 0xFF, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01);
        escrever(saida, 0xFF, 0xD9);
        return saida.toByteArray();
    }

    /** JPEG so com APP0 e o fim: nenhum SOF. */
    public static byte[] jpegSemSof() {
        byte[] completo = jpeg(SOF0, 10, 10);
        byte[] semSof = Arrays.copyOf(completo, 20 + 2);
        semSof[20] = (byte) 0xFF;
        semSof[21] = (byte) 0xD9;
        return semSof;
    }

    /** WebP com perdas (bloco {@code VP8 }). */
    public static byte[] webpVp8(int largura, int altura) {
        byte[] bytes = riff("VP8 ", 30);
        bytes[20] = 0x10;
        bytes[23] = (byte) 0x9D;
        bytes[24] = 0x01;
        bytes[25] = 0x2A;
        littleEndian(bytes, 26, largura, 2);
        littleEndian(bytes, 28, altura, 2);
        return bytes;
    }

    /** WebP sem perdas (bloco {@code VP8L}): 14 bits de largura - 1 e 14 de altura - 1. */
    public static byte[] webpVp8l(int largura, int altura) {
        byte[] bytes = riff("VP8L", 25);
        bytes[20] = 0x2F;
        littleEndian(bytes, 21, (largura - 1) | ((altura - 1) << 14), 4);
        return bytes;
    }

    /** WebP estendido (bloco {@code VP8X}): 24 bits de largura - 1 e de altura - 1. */
    public static byte[] webpVp8x(int largura, int altura) {
        byte[] bytes = riff("VP8X", 30);
        littleEndian(bytes, 24, largura - 1, 3);
        littleEndian(bytes, 27, altura - 1, 3);
        return bytes;
    }

    /** {@code RIFF....WEBP} seguido de um bloco desconhecido. */
    public static byte[] webpComBloco(String bloco) {
        return riff(bloco, 30);
    }

    public static byte[] png() {
        return bytes(0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H', 'D', 'R');
    }

    public static byte[] gif() {
        return "GIF89a\u0001\u0000\u0001\u0000".getBytes(StandardCharsets.ISO_8859_1);
    }

    public static byte[] svg() {
        return "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"
                .getBytes(StandardCharsets.UTF_8);
    }

    public static byte[] texto() {
        return "isto nao e uma imagem".getBytes(StandardCharsets.UTF_8);
    }

    /** Os bytes completados com zeros ate {@code tamanho} (o cabecalho continua o mesmo). */
    public static byte[] comTamanho(byte[] imagem, int tamanho) {
        return Arrays.copyOf(imagem, tamanho);
    }

    private static byte[] riff(String bloco, int tamanho) {
        byte[] bytes = new byte[tamanho];
        copiarTexto(bytes, 0, "RIFF");
        littleEndian(bytes, 4, tamanho - 8, 4);
        copiarTexto(bytes, 8, "WEBP");
        copiarTexto(bytes, 12, bloco);
        littleEndian(bytes, 16, tamanho - 20, 4);
        return bytes;
    }

    private static void copiarTexto(byte[] destino, int posicao, String texto) {
        byte[] origem = texto.getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(origem, 0, destino, posicao, origem.length);
    }

    private static void littleEndian(byte[] destino, int posicao, int valor, int quantidadeDeBytes) {
        for (int i = 0; i < quantidadeDeBytes; i++) {
            destino[posicao + i] = (byte) (valor >>> (8 * i));
        }
    }

    private static void escrever(ByteArrayOutputStream saida, int... valores) {
        for (int valor : valores) {
            saida.write(valor);
        }
    }

    private static byte[] bytes(int... valores) {
        byte[] bytes = new byte[valores.length];
        for (int i = 0; i < valores.length; i++) {
            bytes[i] = (byte) valores[i];
        }
        return bytes;
    }
}
