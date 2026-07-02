package com.upeflow.erpell.company.dto;

import java.time.LocalDateTime;

import com.upeflow.erpell.company.Empresa;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica de uma {@link Empresa}.
 *
 * <p>Nao ha campo sensivel em {@link Empresa}, mas ainda assim a entidade JPA
 * nunca deve ser exposta diretamente na API (ver CLAUDE.md).
 */
@Schema(description = "Dados publicos da empresa")
public record EmpresaResponse(
        Long id,
        String nome,
        boolean ativo,
        LocalDateTime criadoEm,
        LocalDateTime atualizadoEm) {

    public static EmpresaResponse de(Empresa empresa) {
        return new EmpresaResponse(
                empresa.getId(),
                empresa.getNome(),
                empresa.isAtivo(),
                empresa.getCriadoEm(),
                empresa.getAtualizadoEm());
    }
}
