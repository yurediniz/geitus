package com.geitus.app.supplier.dto;

import java.util.UUID;

import com.geitus.app.supplier.Fornecedor;
import com.geitus.app.supplier.TipoPessoaFornecedor;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Item da listagem de fornecedores (docs/modules/fornecedores-e-marcas.md,
 * 4.7). Documento e telefones so com digitos; a tela formata.
 */
@Schema(description = "Fornecedor na listagem")
public record FornecedorItemResponse(
        UUID id,
        Long numero,
        String razaoSocial,
        String nomeFantasia,
        TipoPessoaFornecedor tipoPessoa,
        String documento,
        String telefone,
        @Schema(description = "O primeiro representante; null sem representantes")
        RepresentantePrincipalResponse representantePrincipal,
        long quantidadeProdutos,
        boolean ativo) {

    public static FornecedorItemResponse de(Fornecedor fornecedor, long quantidadeProdutos) {
        RepresentantePrincipalResponse principal = fornecedor.getRepresentantes().stream()
                .findFirst()
                .map(RepresentantePrincipalResponse::de)
                .orElse(null);
        return new FornecedorItemResponse(fornecedor.getUuid(), fornecedor.getNumero(), fornecedor.getRazaoSocial(),
                fornecedor.getNomeFantasia(), fornecedor.getTipoPessoa(), fornecedor.getDocumento(),
                fornecedor.getTelefone(), principal, quantidadeProdutos, fornecedor.isAtivo());
    }
}
