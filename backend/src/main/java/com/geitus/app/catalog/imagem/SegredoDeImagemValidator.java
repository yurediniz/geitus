package com.geitus.app.catalog.imagem;

import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Validacao fail-fast do segredo das URLs assinadas de imagem na subida da
 * aplicacao (docs/modules/produtos-imagem.md, 4.2), no mesmo padrao do
 * {@code JwtSecretValidator}.
 *
 * <p>O HMAC-SHA256 pede uma chave de pelo menos 256 bits (32 bytes). Se
 * {@code GEITUS_IMAGEM_SEGREDO} estiver ausente, curto, igual ao valor de
 * exemplo do {@code .env.example} (publico) ou igual ao {@code JWT_SECRET} (um
 * segredo vazado nao pode valer para os dois usos), a aplicacao NAO sobe. As mensagens nunca mostram o valor.
 */
@Component
public class SegredoDeImagemValidator implements InitializingBean {

    private static final int MINIMO_BYTES = 32;
    /** O valor de exemplo do {@code .env.example}: publico no repositorio, nunca serve como segredo. */
    static final String SEGREDO_DE_EXEMPLO = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    private final String segredo;
    private final String segredoDoJwt;

    public SegredoDeImagemValidator(@Value("${geitus.imagens.segredo:}") String segredo,
            @Value("${geitus.security.jwt.secret:}") String segredoDoJwt) {
        this.segredo = segredo;
        this.segredoDoJwt = segredoDoJwt;
    }

    @Override
    public void afterPropertiesSet() {
        if (segredo == null || segredo.isBlank()) {
            throw new IllegalStateException("GEITUS_IMAGEM_SEGREDO nao configurado. Defina a variavel de ambiente "
                    + "GEITUS_IMAGEM_SEGREDO com um segredo forte (no minimo " + MINIMO_BYTES
                    + " bytes), diferente do JWT_SECRET.");
        }
        int bytes = segredo.getBytes(StandardCharsets.UTF_8).length;
        if (bytes < MINIMO_BYTES) {
            throw new IllegalStateException("GEITUS_IMAGEM_SEGREDO muito curto (" + bytes + " bytes). O HMAC-SHA256 "
                    + "das URLs de imagem exige no minimo " + MINIMO_BYTES + " bytes. Defina um segredo maior.");
        }
        if (segredo.equals(SEGREDO_DE_EXEMPLO)) {
            throw new IllegalStateException("GEITUS_IMAGEM_SEGREDO com o valor de exemplo do .env.example. Gere um "
                    + "segredo aleatorio proprio.");
        }
        if (segredo.equals(segredoDoJwt)) {
            throw new IllegalStateException("GEITUS_IMAGEM_SEGREDO igual ao JWT_SECRET. Use um segredo proprio para "
                    + "as URLs de imagem.");
        }
    }
}
