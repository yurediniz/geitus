package com.geitus.app.company;

/**
 * Lancada quando os dados do cadastro da empresa violam uma regra de negocio
 * verificada no service (defesa em profundidade sobre a Bean Validation):
 * digitos de CPF/CNPJ/telefone invalidos, CEP fora do formato, coerencia PJ/PF
 * quebrada, tipo de pessoa fora da allow-list.
 *
 * <p>Mapeada para HTTP 400 (Bad Request) pelo {@code GlobalExceptionHandler}. A
 * mensagem e clara e segura para o cliente (nao vaza detalhe interno).
 */
public class DadosEmpresaInvalidosException extends RuntimeException {

    public DadosEmpresaInvalidosException(String mensagem) {
        super(mensagem);
    }
}
