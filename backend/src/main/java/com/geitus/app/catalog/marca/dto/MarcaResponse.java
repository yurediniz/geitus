package com.geitus.app.catalog.marca.dto;

import java.time.LocalDateTime;
import java.util.UUID;

import com.geitus.app.catalog.marca.Marca;
import com.geitus.app.catalog.arvore.Arvore;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica de uma {@link Marca} (docs/modules/fornecedores-e-marcas.md).
 *
 * <p>Lista plana: o frontend monta a arvore pelo {@code parentId}. Ids sao
 * UUIDs publicos; a PK numerica e o {@code empresaId} nunca saem na API.
 */
@Schema(description = "Dados publicos de uma marca")
public record MarcaResponse(
        @Schema(description = "Identificador publico (UUID)")
        UUID id,
        String nome,
        @Schema(description = "UUID da marca pai; nulo = raiz")
        UUID parentId,
        @Schema(example = "Boehringer › Nexgard › Nexgard Combo")
        String caminho,
        @Schema(description = "Profundidade: 0 = raiz")
        int nivel,
        boolean ativo,
        @Schema(description = "Ativa e sem ancestral inativo: pode ser escolhida no produto")
        boolean selecionavel,
        int quantidadeSubmarcas,
        long quantidadeProdutos,
        @Schema(description = "Fornecedores que vendem a marca (ligados diretamente a ela)")
        long quantidadeFornecedores,
        LocalDateTime criadoEm,
        LocalDateTime atualizadoEm) {

    public static MarcaResponse de(Marca marca, Arvore<Marca> arvore, long quantidadeProdutos,
            long quantidadeFornecedores) {
        Long id = marca.getId();
        return new MarcaResponse(
                marca.getUuid(),
                marca.getNome(),
                marca.getPaiUuid(),
                arvore.caminho(id),
                arvore.nivel(id),
                marca.isAtivo(),
                arvore.selecionavel(id),
                arvore.quantidadeFilhos(id),
                quantidadeProdutos,
                quantidadeFornecedores,
                marca.getCriadoEm(),
                marca.getAtualizadoEm());
    }
}
