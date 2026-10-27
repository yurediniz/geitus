package com.geitus.app.supplier;

/**
 * Tipo de pessoa do fornecedor (docs/modules/fornecedores-e-marcas.md):
 * {@code PJ} com CNPJ e inscricao estadual, {@code PF} com CPF. O valor e o
 * da coluna {@code fornecedores.tipo_pessoa} (CHECK {@code ck_fornecedor_tipo_pessoa}, V14).
 */
public enum TipoPessoaFornecedor {
    PJ,
    PF
}
