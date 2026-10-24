package com.geitus.app.catalog;

import com.geitus.app.catalog.dto.ProdutoDoFornecedorResponse;

/**
 * Resultado de ligar um produto a um fornecedor pela tela do fornecedor: o
 * item da lista e se a ligacao foi criada agora ({@code true}, 201) ou ja
 * existia (200).
 */
public record LigacaoDoProduto(ProdutoDoFornecedorResponse produto, boolean criada) {
}
