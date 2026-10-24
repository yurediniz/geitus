package com.geitus.app.catalog.dto;

import java.util.List;
import java.util.Map;

import com.geitus.app.catalog.FornecedorResumido;
import com.geitus.app.catalog.arvore.Arvore;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.marca.Marca;

/**
 * Cadastros da empresa que a resposta do produto consulta: as arvores de
 * categorias e de marcas (para os caminhos), os fornecedores ligados (Fase
 * B5, por id interno) e as imagens (Fase F, por id interno, sem os bytes).
 * Montados uma vez por requisicao pelo service (na listagem, uma vez para a
 * pagina inteira), nunca uma vez por produto.
 */
public record ReferenciasDoProduto(CategoriaArvore categorias, Arvore<Marca> marcas,
        Map<Long, FornecedorResumido> fornecedores, ImagensDosProdutos imagens) {

    public ReferenciasDoProduto {
        fornecedores = Map.copyOf(fornecedores);
    }

    /** Sem imagens: serve as respostas de produto sem imagem. */
    public ReferenciasDoProduto(CategoriaArvore categorias, Arvore<Marca> marcas,
            Map<Long, FornecedorResumido> fornecedores) {
        this(categorias, marcas, fornecedores, ImagensDosProdutos.nenhuma());
    }

    /** Sem fornecedores nem imagens: serve as respostas de produto sem fornecedor ligado. */
    public ReferenciasDoProduto(CategoriaArvore categorias, Arvore<Marca> marcas) {
        this(categorias, marcas, Map.of());
    }

    /** Sem nenhum cadastro: serve ao produto sem categoria, sem marca, sem fornecedores e sem imagem. */
    public static ReferenciasDoProduto vazias() {
        return new ReferenciasDoProduto(CategoriaArvore.de(List.of()), Arvore.de(List.of()), Map.of());
    }
}
