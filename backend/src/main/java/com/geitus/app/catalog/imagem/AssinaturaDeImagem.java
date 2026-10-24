package com.geitus.app.catalog.imagem;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * URLs assinadas da imagem do produto (docs/modules/produtos-imagem.md, 4.2;
 * DEC-040). A tag {@code <img>} nao envia o JWT, entao quem autoriza a
 * leitura e a assinatura da URL, gerada so para quem ja leu o produto.
 *
 * <ul>
 *   <li><b>Assinatura:</b> HMAC-SHA256, em hexadecimal, de
 *       {@code produtoUuid|versao|tamanho|expira}, com o segredo proprio
 *       {@code geitus.imagens.segredo} (validado na subida pelo
 *       {@link SegredoDeImagemValidator}). Trocar qualquer parte da URL a
 *       invalida; a comparacao e em tempo constante.</li>
 *   <li><b>Validade:</b> {@code expira} e o fim do dia UTC seguinte ao da
 *       geracao (00:00 UTC de depois de amanha): a URL fica igual durante o
 *       dia, para o cache do navegador funcionar, e vale de 24 a 48 h.</li>
 * </ul>
 *
 * <p>O relogio e o da aplicacao ({@code Clock}, DEC-033); o calculo do dia e
 * em UTC, independente do fuso do negocio.
 */
@Component
public class AssinaturaDeImagem {

    static final String CAMINHO = "/api/imagens/produtos/";
    private static final String ALGORITMO = "HmacSHA256";
    private static final String SEPARADOR = "|";
    private static final int DIAS_ATE_A_VALIDADE = 2;
    private static final HexFormat HEXADECIMAL = HexFormat.of();

    private final String segredo;
    private final Clock relogio;

    public AssinaturaDeImagem(@Value("${geitus.imagens.segredo:}") String segredo, Clock relogio) {
        this.segredo = segredo;
        this.relogio = relogio;
    }

    /** URL relativa e assinada de uma versao da imagem, valida ate o fim do dia UTC seguinte. */
    public String url(UUID produtoUuid, UUID versao, TamanhoDaImagem tamanho) {
        long expira = validadeDeQuemGeraAgora();
        return CAMINHO + produtoUuid + "/" + versao + "/" + tamanho.noCaminho()
                + "?expira=" + expira + "&assinatura=" + assinar(produtoUuid, versao, tamanho, expira);
    }

    /** {@code true} so com a assinatura destas partes e {@code expira} ainda no futuro. */
    public boolean valida(UUID produtoUuid, UUID versao, TamanhoDaImagem tamanho, long expira, String assinatura) {
        if (assinatura == null || expira <= agoraEmSegundos()) {
            return false;
        }
        byte[] esperada = assinar(produtoUuid, versao, tamanho, expira).getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(esperada, assinatura.getBytes(StandardCharsets.US_ASCII));
    }

    /** Segundos que faltam ate {@code expira} (o {@code max-age} do cache); zero se ja passou. */
    public long segundosAte(long expira) {
        return Math.max(0, expira - agoraEmSegundos());
    }

    private long validadeDeQuemGeraAgora() {
        LocalDate hojeEmUtc = LocalDate.ofInstant(relogio.instant(), ZoneOffset.UTC);
        return hojeEmUtc.plusDays(DIAS_ATE_A_VALIDADE).atStartOfDay(ZoneOffset.UTC).toEpochSecond();
    }

    private long agoraEmSegundos() {
        return relogio.instant().getEpochSecond();
    }

    private String assinar(UUID produtoUuid, UUID versao, TamanhoDaImagem tamanho, long expira) {
        String mensagem = produtoUuid + SEPARADOR + versao + SEPARADOR + tamanho.noCaminho() + SEPARADOR + expira;
        try {
            Mac mac = Mac.getInstance(ALGORITMO);
            mac.init(new SecretKeySpec(segredo.getBytes(StandardCharsets.UTF_8), ALGORITMO));
            return HEXADECIMAL.formatHex(mac.doFinal(mensagem.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException semHmac) {
            throw new IllegalStateException("Nao foi possivel assinar a URL da imagem.", semHmac);
        }
    }
}
