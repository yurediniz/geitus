package com.geitus.app.iam;

/**
 * Lancada quando os dados de uma operacao sobre usuarios violam uma regra de
 * validacao de dominio verificada no service (defesa em profundidade, alem da
 * Bean Validation dos DTOs). Exemplos: perfil fora da allow-list, senha abaixo
 * do minimo, senha atual incorreta na troca da propria senha.
 *
 * <p>Mapeada para HTTP 400 (Bad Request) pelo {@code GlobalExceptionHandler}.
 */
public class DadosUsuarioInvalidosException extends RuntimeException {

    public DadosUsuarioInvalidosException(String mensagem) {
        super(mensagem);
    }
}
