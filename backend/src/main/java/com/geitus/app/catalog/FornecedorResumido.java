package com.geitus.app.catalog;

import java.util.UUID;

/**
 * Um fornecedor como o catalogo e o estoque o veem (docs/modules/fornecedores-e-marcas.md,
 * 5 e 6): o id interno (para as ligacoes), o UUID publico, o numero, o nome
 * (a razao social) e se esta ativo. Vem do pacote {@code supplier} pela
 * interface {@link NomesDeFornecedores}.
 */
public record FornecedorResumido(Long id, UUID uuid, Long numero, String nome, boolean ativo) {
}
