package com.geitus.app.supplier;

/**
 * Dados editaveis do cadastro do {@link Fornecedor}, ja normalizados e
 * validados pelo {@code FornecedorService} (docs/modules/fornecedores-e-marcas.md,
 * 4.1): textos aparados, vazio como {@code null}, documento, CEP e telefone so
 * com digitos, UF em maiusculas e inscricao estadual so no PJ.
 *
 * <p>Representantes e marcas ficam fora: sao listas proprias do fornecedor.
 */
public record DadosFornecedor(
        TipoPessoaFornecedor tipoPessoa,
        String documento,
        String razaoSocial,
        String nomeFantasia,
        String inscricaoEstadual,
        EnderecoDoFornecedor endereco,
        String telefone,
        String email,
        String observacoes) {
}
