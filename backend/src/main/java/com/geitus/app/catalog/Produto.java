package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * Produto fisico do Geitus.
 *
 * <p>Todo produto nasce vinculado a uma empresa (tenant), conforme DEC-016, e
 * nunca deve ser lido ou alterado fora da empresa a que pertence. A empresa e
 * imutavel apos a criacao; os demais dados so mudam via
 * {@link #atualizarDadosBasicos} (nao ha setters individuais), garantindo que
 * as alteracoes passem pelas regras do {@code ProdutoService}.
 *
 * <p>Unidade de venda (obrigatoria), categoria e unidade de compra sao
 * cadastros da mesma empresa (docs/modules/categorias-e-unidades.md, secao 5);
 * o service valida a empresa e a V6 garante no banco com FKs compostas
 * {@code (empresa_id, id)}. As colunas de texto antigas {@code produtos.categoria}
 * e {@code produtos.unidade} continuam no banco ate a Fase B, mas nao sao mais
 * mapeadas (a aplicacao nao as le nem escreve).
 *
 * <p>Nao deve ser exposta diretamente na API: o {@code ProdutoController} usa
 * DTOs ({@code ProdutoRequest}/{@code ProdutoResponse}).
 */
@Entity
@Table(name = "produtos")
public class Produto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "empresa_id", nullable = false)
    private Empresa empresa;

    @Column(nullable = false, length = 150)
    private String nome;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "unidade_id", nullable = false)
    private UnidadeMedida unidade;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "categoria_id")
    private Categoria categoria;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "unidade_compra_id")
    private UnidadeMedida unidadeCompra;

    @Column(name = "fator_conversao", precision = 12, scale = 4)
    private BigDecimal fatorConversao;

    @Column(length = 100)
    private String marca;

    @Column(length = 1000)
    private String descricao;

    @Column(name = "preco_venda", nullable = false, precision = 12, scale = 2)
    private BigDecimal precoVenda;

    @Column(precision = 12, scale = 2)
    private BigDecimal custo;

    @Column(name = "estoque_minimo", precision = 12, scale = 3)
    private BigDecimal estoqueMinimo;

    @Column(name = "estoque_maximo", precision = 12, scale = 3)
    private BigDecimal estoqueMaximo;

    @Column(name = "ponto_reposicao", precision = 12, scale = 3)
    private BigDecimal pontoReposicao;

    @Column(name = "preco_minimo", precision = 12, scale = 2)
    private BigDecimal precoMinimo;

    @Column(name = "codigo_barras", length = 50)
    private String codigoBarras;

    @Column(length = 50)
    private String sku;

    @Column(nullable = false)
    private boolean ativo = true;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    @Column(name = "atualizado_em")
    private LocalDateTime atualizadoEm;

    protected Produto() {
        // Construtor exigido pelo JPA.
    }

    /**
     * Cria um produto ja com os dados basicos. A empresa (tenant) e imutavel
     * apos a criacao; os demais campos podem ser alterados via
     * {@link #atualizarDadosBasicos}. O service e responsavel por validar as
     * regras de negocio antes de instanciar.
     */
    public Produto(Empresa empresa, String nome, UnidadeMedida unidade, Categoria categoria,
            UnidadeMedida unidadeCompra, BigDecimal fatorConversao, BigDecimal precoVenda,
            BigDecimal custo, BigDecimal estoqueMinimo, String codigoBarras, String sku,
            String marca, String descricao, BigDecimal estoqueMaximo, BigDecimal pontoReposicao,
            BigDecimal precoMinimo) {
        this.empresa = empresa;
        this.ativo = true;
        atualizarDadosBasicos(nome, unidade, categoria, unidadeCompra, fatorConversao, precoVenda, custo,
                estoqueMinimo, codigoBarras, sku, marca, descricao, estoqueMaximo, pontoReposicao, precoMinimo);
    }

    @PrePersist
    void aoCriar() {
        this.criadoEm = LocalDateTime.now();
    }

    @PreUpdate
    void aoAtualizar() {
        this.atualizadoEm = LocalDateTime.now();
    }

    /**
     * Atualiza os dados basicos do produto. Chamado pelo service apos as
     * validacoes de regra de negocio (nome, preco, unicidade de SKU/codigo
     * de barras, unidade/categoria da empresa, coerencia da conversao de
     * compra) ja terem sido feitas.
     */
    public void atualizarDadosBasicos(String nome, UnidadeMedida unidade, Categoria categoria,
            UnidadeMedida unidadeCompra, BigDecimal fatorConversao, BigDecimal precoVenda,
            BigDecimal custo, BigDecimal estoqueMinimo, String codigoBarras, String sku,
            String marca, String descricao, BigDecimal estoqueMaximo, BigDecimal pontoReposicao,
            BigDecimal precoMinimo) {
        this.nome = nome;
        this.unidade = unidade;
        this.categoria = categoria;
        this.unidadeCompra = unidadeCompra;
        this.fatorConversao = fatorConversao;
        this.precoVenda = precoVenda;
        this.custo = custo;
        this.estoqueMinimo = estoqueMinimo;
        this.codigoBarras = codigoBarras;
        this.sku = sku;
        this.marca = marca;
        this.descricao = descricao;
        this.estoqueMaximo = estoqueMaximo;
        this.pontoReposicao = pontoReposicao;
        this.precoMinimo = precoMinimo;
    }

    public void inativar() {
        this.ativo = false;
    }

    public void ativar() {
        this.ativo = true;
    }

    public Long getId() {
        return id;
    }

    public Empresa getEmpresa() {
        return empresa;
    }

    public Long getEmpresaId() {
        return empresa == null ? null : empresa.getId();
    }

    public String getNome() {
        return nome;
    }

    /** Unidade de venda (sempre presente). */
    public UnidadeMedida getUnidade() {
        return unidade;
    }

    /** Categoria, ou {@code null} se o produto nao tiver categoria. */
    public Categoria getCategoria() {
        return categoria;
    }

    /** Unidade de compra, ou {@code null}; quando presente, {@link #getFatorConversao()} tambem esta. */
    public UnidadeMedida getUnidadeCompra() {
        return unidadeCompra;
    }

    /** Unidades de venda contidas em 1 unidade de compra, ou {@code null}. */
    public BigDecimal getFatorConversao() {
        return fatorConversao;
    }

    public String getMarca() {
        return marca;
    }

    public String getDescricao() {
        return descricao;
    }

    public BigDecimal getPrecoVenda() {
        return precoVenda;
    }

    public BigDecimal getCusto() {
        return custo;
    }

    public BigDecimal getEstoqueMinimo() {
        return estoqueMinimo;
    }

    public BigDecimal getEstoqueMaximo() {
        return estoqueMaximo;
    }

    public BigDecimal getPontoReposicao() {
        return pontoReposicao;
    }

    public BigDecimal getPrecoMinimo() {
        return precoMinimo;
    }

    public String getCodigoBarras() {
        return codigoBarras;
    }

    public String getSku() {
        return sku;
    }

    public boolean isAtivo() {
        return ativo;
    }

    public LocalDateTime getCriadoEm() {
        return criadoEm;
    }

    public LocalDateTime getAtualizadoEm() {
        return atualizadoEm;
    }
}
