package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import com.geitus.app.catalog.dto.ProdutoRequest;

/**
 * Monta {@link ProdutoRequest} nos testes sem repetir os argumentos do
 * record. Parte de um produto minimo valido (nome, preco e unidade) e cada
 * teste ajusta so o que importa para ele.
 */
final class ProdutoRequestBuilder {

    private String nome = "Produto";
    private String nomeCurto;
    private String marca;
    private String fornecedor;
    private String descricao;
    private UUID unidadeId;
    private UUID categoriaId;
    private UUID unidadeCompraId;
    private BigDecimal fatorConversao;
    private BigDecimal precoVenda = new BigDecimal("10.00");
    private BigDecimal custo;
    private BigDecimal estoqueMinimo;
    private BigDecimal estoqueMaximo;
    private BigDecimal pontoReposicao;
    private BigDecimal precoMinimo;
    private List<String> codigosBarras = new ArrayList<>();
    private String sku;

    private ProdutoRequestBuilder(UUID unidadeId) {
        this.unidadeId = unidadeId;
    }

    static ProdutoRequestBuilder comUnidade(UUID unidadeId) {
        return new ProdutoRequestBuilder(unidadeId);
    }

    ProdutoRequestBuilder nome(String valor) {
        this.nome = valor;
        return this;
    }

    ProdutoRequestBuilder nomeCurto(String valor) {
        this.nomeCurto = valor;
        return this;
    }

    ProdutoRequestBuilder marca(String valor) {
        this.marca = valor;
        return this;
    }

    ProdutoRequestBuilder fornecedor(String valor) {
        this.fornecedor = valor;
        return this;
    }

    ProdutoRequestBuilder descricao(String valor) {
        this.descricao = valor;
        return this;
    }

    ProdutoRequestBuilder unidadeId(UUID valor) {
        this.unidadeId = valor;
        return this;
    }

    ProdutoRequestBuilder categoriaId(UUID valor) {
        this.categoriaId = valor;
        return this;
    }

    ProdutoRequestBuilder compra(UUID unidade, String fator) {
        this.unidadeCompraId = unidade;
        this.fatorConversao = fator == null ? null : new BigDecimal(fator);
        return this;
    }

    ProdutoRequestBuilder precoVenda(String valor) {
        this.precoVenda = valor == null ? null : new BigDecimal(valor);
        return this;
    }

    ProdutoRequestBuilder custo(String valor) {
        this.custo = new BigDecimal(valor);
        return this;
    }

    ProdutoRequestBuilder estoqueMinimo(String valor) {
        this.estoqueMinimo = new BigDecimal(valor);
        return this;
    }

    ProdutoRequestBuilder estoqueMaximo(String valor) {
        this.estoqueMaximo = new BigDecimal(valor);
        return this;
    }

    ProdutoRequestBuilder pontoReposicao(String valor) {
        this.pontoReposicao = new BigDecimal(valor);
        return this;
    }

    ProdutoRequestBuilder precoMinimo(String valor) {
        this.precoMinimo = new BigDecimal(valor);
        return this;
    }

    ProdutoRequestBuilder codigosBarras(String... valores) {
        this.codigosBarras = Arrays.asList(valores);
        return this;
    }

    ProdutoRequestBuilder codigosBarras(List<String> valores) {
        this.codigosBarras = valores;
        return this;
    }

    ProdutoRequestBuilder sku(String valor) {
        this.sku = valor;
        return this;
    }

    ProdutoRequest build() {
        return new ProdutoRequest(nome, nomeCurto, marca, fornecedor, descricao, unidadeId, categoriaId,
                unidadeCompraId, fatorConversao, precoVenda, custo, estoqueMinimo, estoqueMaximo, pontoReposicao,
                precoMinimo, codigosBarras, sku);
    }
}
