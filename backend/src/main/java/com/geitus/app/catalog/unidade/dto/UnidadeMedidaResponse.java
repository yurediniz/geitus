package com.geitus.app.catalog.unidade.dto;

import java.time.LocalDateTime;
import java.util.UUID;

import com.geitus.app.catalog.unidade.UnidadeMedida;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica de uma {@link UnidadeMedida}
 * (docs/modules/produtos.md).
 *
 * <p>O {@code id} e o UUID publico; a PK numerica e o {@code empresaId} nunca
 * saem na API. {@code emUso} e a quantidade de produtos que usam a unidade
 * (venda ou embalagem).
 */
@Schema(description = "Dados publicos de uma unidade de medida")
public record UnidadeMedidaResponse(
        @Schema(description = "Identificador publico (UUID)")
        UUID id,
        String sigla,
        String descricao,
        boolean fracionada,
        boolean ativo,
        @Schema(description = "Quantidade de produtos que usam a unidade (venda ou embalagem)")
        long emUso,
        LocalDateTime criadoEm,
        LocalDateTime atualizadoEm) {

    public static UnidadeMedidaResponse de(UnidadeMedida unidade, long emUso) {
        return new UnidadeMedidaResponse(
                unidade.getUuid(),
                unidade.getSigla(),
                unidade.getDescricao(),
                unidade.isFracionada(),
                unidade.isAtivo(),
                emUso,
                unidade.getCriadoEm(),
                unidade.getAtualizadoEm());
    }
}
