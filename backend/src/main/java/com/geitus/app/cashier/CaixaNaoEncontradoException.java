package com.geitus.app.cashier;

/**
 * Ponto ou sessao de caixa que nao existe na empresa do usuario, que e de
 * outra empresa (DEC-016) ou, para o OPERADOR, sessao aberta por outra pessoa
 * (docs/modules/caixa.md). A resposta e a mesma nos tres casos: 404 com
 * mensagem fixa, sem o identificador consultado.
 */
public class CaixaNaoEncontradoException extends RuntimeException {

    public static final String MENSAGEM_PONTO = "Ponto de caixa não encontrado.";
    public static final String MENSAGEM_SESSAO = "Caixa não encontrado.";

    private CaixaNaoEncontradoException(String mensagem) {
        super(mensagem);
    }

    public static CaixaNaoEncontradoException ponto() {
        return new CaixaNaoEncontradoException(MENSAGEM_PONTO);
    }

    public static CaixaNaoEncontradoException sessao() {
        return new CaixaNaoEncontradoException(MENSAGEM_SESSAO);
    }
}
