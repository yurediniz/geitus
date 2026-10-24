package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import com.geitus.app.catalog.dto.AtacadoRequest;
import com.geitus.app.catalog.dto.ProdutoRequest;
import com.geitus.app.catalog.dto.PromocaoRequest;

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
    private BigDecimal precoVenda = new BigDecimal("10.00");
    private BigDecimal custo;
    private BigDecimal estoqueMinimo;
    private BigDecimal estoqueMaximo;
    private BigDecimal pontoReposicao;
    private BigDecimal precoMinimo;
    private List<String> codigosBarras = new ArrayList<>();
    private String sku;
    private Integer codigo;
    private Boolean vendidoBalanca;
    private PromocaoRequest promocao;
    private AtacadoRequest atacado;
    private Boolean controlaEstoque = true;
    private BigDecimal estoqueInicial;

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

    ProdutoRequestBuilder custoRemovido() {
        this.custo = null;
        return this;
    }

    /** Promocao com o preco informado (ou {@code null}, para testar a promocao incompleta). */
    ProdutoRequestBuilder promocao(String preco, LocalDate inicio, LocalDate fim) {
        this.promocao = new PromocaoRequest(preco == null ? null : new BigDecimal(preco), inicio, fim);
        return this;
    }

    ProdutoRequestBuilder atacado(String preco, String quantidadeMinima) {
        this.atacado = new AtacadoRequest(preco == null ? null : new BigDecimal(preco),
                quantidadeMinima == null ? null : new BigDecimal(quantidadeMinima));
        return this;
    }

    /** Codigo do produto (Fase B2); {@code null} = sem codigo. */
    ProdutoRequestBuilder codigoDoProduto(Integer valor) {
        this.codigo = valor;
        return this;
    }

    /** {@code null} simula o campo ausente no JSON (vale {@code false}). */
    ProdutoRequestBuilder vendidoBalanca(Boolean valor) {
        this.vendidoBalanca = valor;
        return this;
    }

    /** {@code null} simula o campo ausente no JSON (o Bean Validation recusa). */
    ProdutoRequestBuilder controlaEstoque(Boolean valor) {
        this.controlaEstoque = valor;
        return this;
    }

    ProdutoRequestBuilder estoqueInicial(String valor) {
        this.estoqueInicial = valor == null ? null : new BigDecimal(valor);
        return this;
    }

    ProdutoRequest build() {
        return new ProdutoRequest(nome, nomeCurto, marca, fornecedor, descricao, unidadeId, categoriaId,
                precoVenda, custo, estoqueMinimo, estoqueMaximo, pontoReposicao,
                precoMinimo, codigosBarras, sku, codigo, vendidoBalanca, promocao, atacado, controlaEstoque,
                estoqueInicial);
    }
}
