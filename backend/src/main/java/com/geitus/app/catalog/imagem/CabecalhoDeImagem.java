package com.geitus.app.catalog.imagem;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

/**
 * Le o tipo real e as dimensoes de uma imagem so pelo cabecalho
 * (docs/modules/produtos-imagem.md, 4.1), sem biblioteca nova: o Java nao le
 * WebP sozinho e o servidor nao decodifica nem recomprime a imagem.
 *
 * <ul>
 *   <li><b>Tipo:</b> JPEG comeca com {@code FF D8 FF}; WebP comeca com
 *       {@code RIFF} e tem {@code WEBP} nos bytes 8 a 11. O
 *       {@code Content-Type} e a extensao enviados pelo cliente nao contam.</li>
 *   <li><b>JPEG:</b> percorre os marcadores ate um SOF ({@code C0} a
 *       {@code CF}, exceto {@code C4}, {@code C8} e {@code CC}), com a altura e
 *       a largura em big-endian.</li>
 *   <li><b>WebP:</b> o primeiro bloco e {@code VP8 } (com perdas),
 *       {@code VP8L} (sem perdas) ou {@code VP8X} (estendido).</li>
 * </ul>
 *
 * <p>Classe de dominio pura: todo acesso aos bytes confere os limites, entao
 * um arquivo truncado ou malformado vira {@link ImagemInvalidaException} com
 * a mensagem da spec, nunca uma excecao de indice (500).
 */
public final class CabecalhoDeImagem {

    public static final String MENSAGEM_DIMENSOES_ILEGIVEIS = "Não foi possível ler as dimensões da imagem.";

    private static final int MARCADOR = 0xFF;
    private static final int JPEG_INICIO = 0xD8;
    private static final int JPEG_FIM = 0xD9;
    private static final int JPEG_INICIO_DOS_DADOS = 0xDA;
    private static final int JPEG_TEMPORARIO = 0x01;
    private static final int JPEG_PRIMEIRO_RESTART = 0xD0;
    private static final int JPEG_ULTIMO_RESTART = 0xD7;
    private static final int JPEG_PRIMEIRO_SOF = 0xC0;
    private static final int JPEG_ULTIMO_SOF = 0xCF;
    /** Na faixa dos SOF, mas sao outras tabelas: DHT, JPG (reservado) e DAC. */
    private static final int JPEG_DHT = 0xC4;
    private static final int JPEG_RESERVADO = 0xC8;
    private static final int JPEG_DAC = 0xCC;
    /** Do inicio do marcador do SOF: altura em +5..+6 e largura em +7..+8. */
    private static final int SOF_ALTURA = 5;
    private static final int SOF_LARGURA = 7;

    private static final int WEBP_INICIO_DO_BLOCO = 12;
    private static final int TAMANHO_DO_NOME_DO_BLOCO = 4;
    private static final int VP8_ASSINATURA = 23;
    private static final int VP8_LARGURA = 26;
    private static final int VP8_ALTURA = 28;
    private static final int VP8_MASCARA_DA_DIMENSAO = 0x3FFF;
    private static final int VP8L_ASSINATURA = 20;
    private static final int VP8L_VALOR_DA_ASSINATURA = 0x2F;
    private static final int VP8L_DIMENSOES = 21;
    private static final int VP8L_BITS_POR_DIMENSAO = 14;
    private static final int VP8X_LARGURA = 24;
    private static final int VP8X_ALTURA = 27;

    private CabecalhoDeImagem() {
    }

    /** Resultado da leitura: o tipo real e as dimensoes em pixels (sempre positivas). */
    public record Leitura(TipoDeImagem tipo, int largura, int altura) {

        public int maiorLado() {
            return Math.max(largura, altura);
        }
    }

    /** O tipo real pelos primeiros bytes; vazio quando nao e JPEG nem WebP (PNG, GIF, SVG, texto, vazio). */
    public static Optional<TipoDeImagem> tipoDe(byte[] bytes) {
        if (bytes == null) {
            return Optional.empty();
        }
        Bytes leitor = new Bytes(bytes);
        if (leitor.comeca(MARCADOR, JPEG_INICIO, MARCADOR)) {
            return Optional.of(TipoDeImagem.JPEG);
        }
        if (leitor.textoEm(0, "RIFF") && leitor.textoEm(8, "WEBP")) {
            return Optional.of(TipoDeImagem.WEBP);
        }
        return Optional.empty();
    }

    /**
     * O tipo e as dimensoes; vazio quando o tipo nao e JPEG nem WebP.
     *
     * @throws ImagemInvalidaException quando o tipo e reconhecido, mas o
     *         cabecalho esta truncado, nao tem as dimensoes ou e desconhecido
     */
    public static Optional<Leitura> ler(byte[] bytes) {
        return tipoDe(bytes).map(tipo -> switch (tipo) {
            case JPEG -> lerJpeg(new Bytes(bytes));
            case WEBP -> lerWebp(new Bytes(bytes));
        });
    }

    private static Leitura lerJpeg(Bytes bytes) {
        int posicao = 2;
        while (true) {
            if (bytes.u8(posicao) != MARCADOR) {
                throw ilegivel();
            }
            int marcador = bytes.u8(posicao + 1);
            if (marcador == MARCADOR) {
                posicao++;
            } else if (semTamanho(marcador)) {
                posicao += 2;
            } else if (marcador == JPEG_INICIO_DOS_DADOS || marcador == JPEG_FIM) {
                throw ilegivel();
            } else if (ehSof(marcador)) {
                return leitura(TipoDeImagem.JPEG, bytes.be16(posicao + SOF_LARGURA),
                        bytes.be16(posicao + SOF_ALTURA));
            } else {
                posicao += 2 + tamanhoDoSegmento(bytes, posicao);
            }
        }
    }

    /** Marcadores sem o campo de tamanho: SOI, TEM e os RST. */
    private static boolean semTamanho(int marcador) {
        return marcador == JPEG_INICIO || marcador == JPEG_TEMPORARIO
                || (marcador >= JPEG_PRIMEIRO_RESTART && marcador <= JPEG_ULTIMO_RESTART);
    }

    private static boolean ehSof(int marcador) {
        return marcador >= JPEG_PRIMEIRO_SOF && marcador <= JPEG_ULTIMO_SOF
                && marcador != JPEG_DHT && marcador != JPEG_RESERVADO && marcador != JPEG_DAC;
    }

    /** O tamanho declarado inclui os 2 bytes do proprio campo; menos que isso e um cabecalho corrompido. */
    private static int tamanhoDoSegmento(Bytes bytes, int posicao) {
        int tamanho = bytes.be16(posicao + 2);
        if (tamanho < 2) {
            throw ilegivel();
        }
        return tamanho;
    }

    private static Leitura lerWebp(Bytes bytes) {
        String bloco = bytes.texto(WEBP_INICIO_DO_BLOCO, TAMANHO_DO_NOME_DO_BLOCO);
        return switch (bloco) {
            case "VP8 " -> lerVp8(bytes);
            case "VP8L" -> lerVp8l(bytes);
            case "VP8X" -> leitura(TipoDeImagem.WEBP, bytes.le24(VP8X_LARGURA) + 1, bytes.le24(VP8X_ALTURA) + 1);
            default -> throw ilegivel();
        };
    }

    /** Quadro-chave com a assinatura {@code 9D 01 2A} e 14 bits de cada dimensao (os 2 de cima sao a escala). */
    private static Leitura lerVp8(Bytes bytes) {
        if (!bytes.contemEm(VP8_ASSINATURA, 0x9D, 0x01, 0x2A)) {
            throw ilegivel();
        }
        return leitura(TipoDeImagem.WEBP, bytes.le16(VP8_LARGURA) & VP8_MASCARA_DA_DIMENSAO,
                bytes.le16(VP8_ALTURA) & VP8_MASCARA_DA_DIMENSAO);
    }

    /** Assinatura {@code 2F} e 28 bits empacotados: largura - 1 nos 14 primeiros e altura - 1 nos seguintes. */
    private static Leitura lerVp8l(Bytes bytes) {
        if (bytes.u8(VP8L_ASSINATURA) != VP8L_VALOR_DA_ASSINATURA) {
            throw ilegivel();
        }
        long bits = bytes.le32(VP8L_DIMENSOES);
        int largura = (int) (bits & VP8_MASCARA_DA_DIMENSAO) + 1;
        int altura = (int) ((bits >>> VP8L_BITS_POR_DIMENSAO) & VP8_MASCARA_DA_DIMENSAO) + 1;
        return leitura(TipoDeImagem.WEBP, largura, altura);
    }

    private static Leitura leitura(TipoDeImagem tipo, int largura, int altura) {
        if (largura <= 0 || altura <= 0) {
            throw ilegivel();
        }
        return new Leitura(tipo, largura, altura);
    }

    private static ImagemInvalidaException ilegivel() {
        return new ImagemInvalidaException(MENSAGEM_DIMENSOES_ILEGIVEIS);
    }

    /** Acesso aos bytes sem sinal, com limites conferidos: fora do arquivo e cabecalho ilegivel. */
    private record Bytes(byte[] conteudo) {

        int u8(int posicao) {
            if (posicao < 0 || posicao >= conteudo.length) {
                throw ilegivel();
            }
            return conteudo[posicao] & 0xFF;
        }

        int be16(int posicao) {
            return (u8(posicao) << 8) | u8(posicao + 1);
        }

        int le16(int posicao) {
            return u8(posicao) | (u8(posicao + 1) << 8);
        }

        int le24(int posicao) {
            return le16(posicao) | (u8(posicao + 2) << 16);
        }

        long le32(int posicao) {
            return le24(posicao) | ((long) u8(posicao + 3) << 24);
        }

        String texto(int posicao, int tamanho) {
            u8(posicao + tamanho - 1);
            return new String(conteudo, posicao, tamanho, StandardCharsets.US_ASCII);
        }

        /** Sem lancar: so para reconhecer o tipo, quando o arquivo pode ser menor que a assinatura. */
        boolean comeca(int... valores) {
            return contemSemLancar(0, valores);
        }

        boolean textoEm(int posicao, String texto) {
            byte[] esperado = texto.getBytes(StandardCharsets.US_ASCII);
            int[] valores = new int[esperado.length];
            for (int i = 0; i < esperado.length; i++) {
                valores[i] = esperado[i];
            }
            return contemSemLancar(posicao, valores);
        }

        boolean contemEm(int posicao, int... valores) {
            u8(posicao + valores.length - 1);
            return contemSemLancar(posicao, valores);
        }

        private boolean contemSemLancar(int posicao, int... valores) {
            if (posicao + valores.length > conteudo.length) {
                return false;
            }
            for (int i = 0; i < valores.length; i++) {
                if ((conteudo[posicao + i] & 0xFF) != valores[i]) {
                    return false;
                }
            }
            return true;
        }
    }
}
