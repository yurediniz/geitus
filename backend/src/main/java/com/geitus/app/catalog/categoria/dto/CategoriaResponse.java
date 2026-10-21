package com.geitus.app.catalog.categoria.dto;

import java.time.LocalDateTime;
import java.util.UUID;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaArvore;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica de uma {@link Categoria} (docs/modules/categorias-e-unidades.md, 4.3).
 *
 * <p>Lista plana: o frontend monta a arvore pelo {@code parentId}. Ids sao
 * UUIDs publicos; a PK numerica e o {@code empresaId} nunca saem na API.
 */
@Schema(description = "Dados publicos de uma categoria")
public record CategoriaResponse(
        @Schema(description = "Identificador publico (UUID)")
        UUID id,
        String nome,
        @Schema(description = "UUID da categoria pai; nulo = raiz")
        UUID parentId,
        @Schema(example = "Ração › Úmida › Sachê")
        String caminho,
        @Schema(description = "Profundidade: 0 = raiz")
        int nivel,
        boolean ativo,
        @Schema(description = "Ativa e sem ancestral inativo: pode ser escolhida no produto")
        boolean selecionavel,
        int quantidadeSubcategorias,
        long quantidadeProdutos,
        LocalDateTime criadoEm,
        LocalDateTime atualizadoEm) {

    public static CategoriaResponse de(Categoria categoria, CategoriaArvore arvore, long quantidadeProdutos) {
        Long id = categoria.getId();
        return new CategoriaResponse(
                categoria.getUuid(),
                categoria.getNome(),
                categoria.getPaiUuid(),
                arvore.caminho(id),
                arvore.nivel(id),
                categoria.isAtivo(),
                arvore.selecionavel(id),
                arvore.quantidadeFilhos(id),
                quantidadeProdutos,
                categoria.getCriadoEm(),
                categoria.getAtualizadoEm());
    }
}
