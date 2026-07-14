package com.geitus.app.shared.error;

import java.time.OffsetDateTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Estrutura padronizada de resposta de erro da API do Geitus (formato JSON).
 *
 * <p>Campos nulos sao omitidos da resposta. A lista {@code campos} so aparece
 * em erros de validacao, detalhando cada campo invalido.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(
        OffsetDateTime timestamp,
        int status,
        String erro,
        String mensagem,
        String caminho,
        List<CampoInvalido> campos) {

    /**
     * Detalhe de um campo que falhou na validacao.
     */
    public record CampoInvalido(String campo, String mensagem) {
    }

    /**
     * Cria um erro sem detalhamento de campos.
     */
    public static ApiError de(int status, String erro, String mensagem, String caminho) {
        return new ApiError(OffsetDateTime.now(), status, erro, mensagem, caminho, null);
    }

    /**
     * Cria um erro de validacao com a lista de campos invalidos.
     */
    public static ApiError deValidacao(int status, String erro, String mensagem, String caminho,
            List<CampoInvalido> campos) {
        return new ApiError(OffsetDateTime.now(), status, erro, mensagem, caminho, campos);
    }
}
