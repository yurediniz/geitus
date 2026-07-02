package com.upeflow.erpell.auth;

import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Validacao fail-fast do segredo JWT na subida da aplicacao.
 *
 * <p>Para o algoritmo HS256 o segredo precisa ter no minimo 256 bits (32 bytes).
 * Se {@code JWT_SECRET} estiver ausente ou for curto demais, a aplicacao NAO deve
 * subir: falha imediatamente com mensagem clara, evitando rodar com seguranca
 * fraca ou inexistente.
 */
@Component
public class JwtSecretValidator implements InitializingBean {

    /** HS256 exige uma chave de pelo menos 256 bits = 32 bytes. */
    private static final int MINIMO_BYTES = 32;

    private final String secret;

    public JwtSecretValidator(@Value("${erpell.security.jwt.secret}") String secret) {
        this.secret = secret;
    }

    @Override
    public void afterPropertiesSet() {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "JWT_SECRET nao configurado. Defina a variavel de ambiente JWT_SECRET "
                            + "com um segredo forte (no minimo 32 bytes / 256 bits) para HS256.");
        }

        int bytes = secret.getBytes(StandardCharsets.UTF_8).length;
        if (bytes < MINIMO_BYTES) {
            throw new IllegalStateException(
                    "JWT_SECRET muito curto (" + bytes + " bytes). O algoritmo HS256 exige "
                            + "no minimo " + MINIMO_BYTES + " bytes (256 bits). Defina um segredo maior.");
        }
    }
}
