package com.geitus.app.supplier;

/**
 * Endereco do fornecedor (docs/modules/fornecedores-e-marcas.md), todo
 * opcional: CEP so com digitos e UF em maiusculas quando informados; os demais
 * textos aparados, com vazio como {@code null}.
 */
public record EnderecoDoFornecedor(
        String cep,
        String logradouro,
        String numero,
        String complemento,
        String bairro,
        String municipio,
        String uf) {

    /** Endereco sem nenhum campo informado. */
    public static final EnderecoDoFornecedor VAZIO = new EnderecoDoFornecedor(null, null, null, null, null, null,
            null);
}
