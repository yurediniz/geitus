package com.geitus.app.supplier.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import com.geitus.app.catalog.dto.MarcaResumo;
import com.geitus.app.supplier.EnderecoDoFornecedor;
import com.geitus.app.supplier.Fornecedor;
import com.geitus.app.supplier.TipoPessoaFornecedor;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica de um {@link Fornecedor} (docs/modules/fornecedores-e-marcas.md,
 * 4.7). So UUIDs saem (DEC-019); a empresa nunca. Documento, CEP e telefones
 * so com digitos; as marcas com o caminho, na ordem da arvore.
 */
@Schema(description = "Dados publicos de um fornecedor")
public record FornecedorResponse(
        @Schema(description = "Identificador publico (UUID)")
        UUID id,
        @Schema(description = "Numero do fornecedor na empresa (1, 2, 3...), gerado e imutavel")
        Long numero,
        TipoPessoaFornecedor tipoPessoa,
        String documento,
        String razaoSocial,
        String nomeFantasia,
        String inscricaoEstadual,
        String cep,
        String logradouro,
        String numeroEndereco,
        String complemento,
        String bairro,
        String municipio,
        String uf,
        String telefone,
        String email,
        String observacoes,
        List<RepresentanteResponse> representantes,
        List<MarcaResumo> marcas,
        long quantidadeProdutos,
        boolean ativo,
        LocalDateTime criadoEm,
        LocalDateTime atualizadoEm) {

    public static FornecedorResponse de(Fornecedor fornecedor, List<MarcaResumo> marcas, long quantidadeProdutos) {
        EnderecoDoFornecedor endereco = fornecedor.getEndereco();
        return new FornecedorResponse(
                fornecedor.getUuid(),
                fornecedor.getNumero(),
                fornecedor.getTipoPessoa(),
                fornecedor.getDocumento(),
                fornecedor.getRazaoSocial(),
                fornecedor.getNomeFantasia(),
                fornecedor.getInscricaoEstadual(),
                endereco.cep(),
                endereco.logradouro(),
                endereco.numero(),
                endereco.complemento(),
                endereco.bairro(),
                endereco.municipio(),
                endereco.uf(),
                fornecedor.getTelefone(),
                fornecedor.getEmail(),
                fornecedor.getObservacoes(),
                fornecedor.getRepresentantes().stream().map(RepresentanteResponse::de).toList(),
                marcas,
                quantidadeProdutos,
                fornecedor.isAtivo(),
                fornecedor.getCriadoEm(),
                fornecedor.getAtualizadoEm());
    }
}
