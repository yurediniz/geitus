package com.geitus.app.iam;

import java.nio.charset.StandardCharsets;
import java.util.Set;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Validacao fail-fast do segredo JWT na subida da aplicacao.
 *
 * <p>Para o algoritmo HS256 o segredo precisa ter no minimo 256 bits (32 bytes).
 * Se {@code JWT_SECRET} estiver ausente, for curto demais ou for um dos valores de
 * exemplo publicos (do {@code .env.example} ou da documentacao), a aplicacao NAO
 * deve subir: falha imediatamente com mensagem clara, evitando rodar com seguranca
 * fraca ou inexistente. As mensagens nunca mostram o valor.
 */
@Component
public class JwtSecretValidator implements InitializingBean {

    /** HS256 exige uma chave de pelo menos 256 bits = 32 bytes. */
    private static final int MINIMO_BYTES = 32;
    /** O valor de exemplo do {@code .env.example}: publico no repositorio, nunca serve como segredo. */
    static final String SEGREDO_DO_ENV_EXAMPLE = "defina-um-segredo-forte-com-no-minimo-32-bytes";
    /** O valor de exemplo que ja foi publicado na documentacao (spec de Autenticacao e {@code backend/README.md}; segue no historico do Git): copiavel. */
    static final String SEGREDO_DA_DOCUMENTACAO = "um-segredo-forte-com-no-minimo-32-bytes-aqui";
    private static final Set<String> SEGREDOS_DE_EXEMPLO = Set.of(SEGREDO_DO_ENV_EXAMPLE, SEGREDO_DA_DOCUMENTACAO);

    private final String secret;

    public JwtSecretValidator(@Value("${geitus.security.jwt.secret}") String secret) {
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

        if (SEGREDOS_DE_EXEMPLO.contains(secret)) {
            throw new IllegalStateException(
                    "JWT_SECRET com um valor de exemplo publico (do .env.example ou da documentacao). "
                            + "Gere um segredo aleatorio proprio.");
        }
    }
}
