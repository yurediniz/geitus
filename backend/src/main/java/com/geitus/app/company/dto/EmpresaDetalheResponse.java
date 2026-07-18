package com.geitus.app.company.dto;

import java.time.LocalDateTime;

import com.geitus.app.company.Empresa;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica completa do cadastro de uma {@link Empresa}, usada pelo
 * endpoint {@code /api/empresas/minha}.
 *
 * <p>Distinta de {@code EmpresaResponse} (minima), reutilizada pelo
 * {@code /auth/me}: a resposta do login deve continuar enxuta para nao inflar o
 * contrato do frontend. A entidade JPA nunca e exposta diretamente (CLAUDE.md).
 */
@Schema(description = "Cadastro completo da empresa (representante, dados e endereço)")
public record EmpresaDetalheResponse(
        Long id,
        String nome,
        String telefone,
        String email,
        TipoPessoa tipoPessoa,
        String cnpj,
        String razaoSocial,
        String inscricaoEstadual,
        RepresentanteLegalResponse representanteLegal,
        EnderecoResponse endereco,
        boolean ativo,
        LocalDateTime criadoEm,
        LocalDateTime atualizadoEm) {

    @Schema(description = "Dados do representante legal")
    public record RepresentanteLegalResponse(
            String nome,
            String cpf,
            String telefone,
            String email) {

        static RepresentanteLegalResponse de(RepresentanteLegal representante) {
            if (representante == null) {
                return null;
            }
            return new RepresentanteLegalResponse(
                    representante.getNome(),
                    representante.getCpf(),
                    representante.getTelefone(),
                    representante.getEmail());
        }
    }

    @Schema(description = "Endereço da empresa")
    public record EnderecoResponse(
            String cep,
            String logradouro,
            String numero,
            String complemento,
            String bairro,
            String municipio,
            String uf) {

        static EnderecoResponse de(Endereco endereco) {
            if (endereco == null) {
                return null;
            }
            return new EnderecoResponse(
                    endereco.getCep(),
                    endereco.getLogradouro(),
                    endereco.getNumero(),
                    endereco.getComplemento(),
                    endereco.getBairro(),
                    endereco.getMunicipio(),
                    endereco.getUf());
        }
    }

    public static EmpresaDetalheResponse de(Empresa empresa) {
        return new EmpresaDetalheResponse(
                empresa.getId(),
                empresa.getNome(),
                empresa.getTelefone(),
                empresa.getEmail(),
                empresa.getTipoPessoa(),
                empresa.getCnpj(),
                empresa.getRazaoSocial(),
                empresa.getInscricaoEstadual(),
                RepresentanteLegalResponse.de(empresa.getRepresentanteLegal()),
                EnderecoResponse.de(empresa.getEndereco()),
                empresa.isAtivo(),
                empresa.getCriadoEm(),
                empresa.getAtualizadoEm());
    }
}
