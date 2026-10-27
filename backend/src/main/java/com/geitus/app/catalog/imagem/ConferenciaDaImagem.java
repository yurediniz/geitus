package com.geitus.app.catalog.imagem;

import com.geitus.app.catalog.imagem.CabecalhoDeImagem.Leitura;

/**
 * Conferencias do servidor sobre a imagem enviada, na ordem da tabela da spec
 * (docs/modules/produtos.md): as duas partes, o tipo real (o mesmo
 * nas duas), os bytes de cada uma, as dimensoes legiveis e o maior lado. O
 * servidor nao recomprime: a imagem que passa e gravada como veio.
 *
 * <p>Os limites sao os mesmos do navegador e das CHECKs da V15.
 */
public final class ConferenciaDaImagem {

    public static final String MENSAGEM_FALTA_PARTE = "Envie a imagem grande e a miniatura.";
    static final String MENSAGEM_FORMATO_NAO_ACEITO = "Formato de imagem não aceito. Use WebP ou JPEG.";
    static final String MENSAGEM_GRANDE_PESADA = "A imagem grande deve ter no máximo 400 KB.";
    static final String MENSAGEM_MINIATURA_PESADA = "A miniatura deve ter no máximo 40 KB.";
    static final String MENSAGEM_GRANDE_COM_LADO_DEMAIS = "A imagem grande deve ter no máximo 1200 px no maior lado.";
    static final String MENSAGEM_MINIATURA_COM_LADO_DEMAIS = "A miniatura deve ter no máximo 200 px no maior lado.";

    static final int MAXIMO_BYTES_DA_GRANDE = 409_600;
    static final int MAXIMO_BYTES_DA_MINIATURA = 40_960;
    static final int MAIOR_LADO_DA_GRANDE = 1_200;
    static final int MAIOR_LADO_DA_MINIATURA = 200;

    private ConferenciaDaImagem() {
    }

    /**
     * A imagem conferida, pronta para gravar.
     *
     * @throws ImagemInvalidaException com a mensagem da primeira conferencia
     *         que falhar
     */
    public static ImagemConferida conferir(byte[] grande, byte[] miniatura) {
        exigirAsDuasPartes(grande, miniatura);
        TipoDeImagem tipo = tipoComumAsDuas(grande, miniatura);
        exigirNoMaximo(grande, MAXIMO_BYTES_DA_GRANDE, MENSAGEM_GRANDE_PESADA);
        exigirNoMaximo(miniatura, MAXIMO_BYTES_DA_MINIATURA, MENSAGEM_MINIATURA_PESADA);
        Leitura daGrande = dimensoes(grande);
        Leitura daMiniatura = dimensoes(miniatura);
        exigirMaiorLadoAte(daGrande, MAIOR_LADO_DA_GRANDE, MENSAGEM_GRANDE_COM_LADO_DEMAIS);
        exigirMaiorLadoAte(daMiniatura, MAIOR_LADO_DA_MINIATURA, MENSAGEM_MINIATURA_COM_LADO_DEMAIS);
        return new ImagemConferida(tipo, versao(grande, daGrande), versao(miniatura, daMiniatura));
    }

    private static void exigirAsDuasPartes(byte[] grande, byte[] miniatura) {
        if (vazia(grande) || vazia(miniatura)) {
            throw new ImagemInvalidaException(MENSAGEM_FALTA_PARTE);
        }
    }

    private static boolean vazia(byte[] parte) {
        return parte == null || parte.length == 0;
    }

    private static TipoDeImagem tipoComumAsDuas(byte[] grande, byte[] miniatura) {
        TipoDeImagem tipo = CabecalhoDeImagem.tipoDe(grande).orElseThrow(ConferenciaDaImagem::formatoNaoAceito);
        if (CabecalhoDeImagem.tipoDe(miniatura).filter(tipo::equals).isEmpty()) {
            throw formatoNaoAceito();
        }
        return tipo;
    }

    private static ImagemInvalidaException formatoNaoAceito() {
        return new ImagemInvalidaException(MENSAGEM_FORMATO_NAO_ACEITO);
    }

    private static void exigirNoMaximo(byte[] parte, int maximoDeBytes, String mensagem) {
        if (parte.length > maximoDeBytes) {
            throw new ImagemInvalidaException(mensagem);
        }
    }

    /** O tipo ja foi reconhecido: o leitor so lanca (cabecalho ilegivel) ou devolve as dimensoes. */
    private static Leitura dimensoes(byte[] parte) {
        return CabecalhoDeImagem.ler(parte)
                .orElseThrow(() -> new ImagemInvalidaException(CabecalhoDeImagem.MENSAGEM_DIMENSOES_ILEGIVEIS));
    }

    private static void exigirMaiorLadoAte(Leitura leitura, int maiorLado, String mensagem) {
        if (leitura.maiorLado() > maiorLado) {
            throw new ImagemInvalidaException(mensagem);
        }
    }

    private static ImagemConferida.Versao versao(byte[] bytes, Leitura leitura) {
        return new ImagemConferida.Versao(bytes, leitura.largura(), leitura.altura());
    }
}
