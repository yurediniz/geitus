package com.geitus.app.iam;

/**
 * Lancada quando uma operacao sobre usuarios conflita com o estado atual ou com
 * uma regra de autoprotecao. Exemplos:
 *
 * <ul>
 *   <li>e-mail ja cadastrado (unicidade global);</li>
 *   <li>tentativa de inativar/rebaixar o ultimo ADMIN ativo da empresa;</li>
 *   <li>ADMIN tentando inativar a si mesmo.</li>
 * </ul>
 *
 * <p>Mapeada para HTTP 409 (Conflict) pelo {@code GlobalExceptionHandler}. A
 * mensagem e clara e segura para o cliente (nao vaza detalhe interno).
 */
public class ConflitoDeUsuarioException extends RuntimeException {

    public ConflitoDeUsuarioException(String mensagem) {
        super(mensagem);
    }
}
