package com.geitus.app.catalog.dto;

import java.util.List;

import com.geitus.app.catalog.arvore.Arvore;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.marca.Marca;

/**
 * Cadastros da empresa que a resposta do produto consulta: as arvores de
 * categorias e de marcas, para os caminhos. Montadas uma vez por requisicao
 * pelo service (na listagem, uma vez para a pagina inteira), nunca uma vez por
 * produto.
 */
public record ReferenciasDoProduto(CategoriaArvore categorias, Arvore<Marca> marcas) {

    /** Sem nenhum cadastro: serve ao produto sem categoria e sem marca. */
    public static ReferenciasDoProduto vazias() {
        return new ReferenciasDoProduto(CategoriaArvore.de(List.of()), Arvore.de(List.of()));
    }
}
