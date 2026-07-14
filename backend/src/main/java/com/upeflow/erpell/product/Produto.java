package com.upeflow.erpell.product;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import com.upeflow.erpell.company.Empresa;

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
 * Produto fisico do ERPell.
 *
 * <p>Todo produto nasce vinculado a uma empresa (tenant), conforme DEC-016, e
 * nunca deve ser lido ou alterado fora da empresa a que pertence. A empresa e
 * imutavel apos a criacao; os demais dados so mudam via
 * {@link #atualizarDadosBasicos} (nao ha setters individuais), garantindo que
 * as alteracoes passem pelas regras do {@code ProdutoService}.
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

    @Column(length = 100)
    private String categoria;

    @Column(length = 20)
    private String unidade;

    @Column(name = "preco_venda", nullable = false, precision = 12, scale = 2)
    private BigDecimal precoVenda;

    @Column(precision = 12, scale = 2)
    private BigDecimal custo;

    @Column(name = "estoque_minimo", precision = 12, scale = 3)
    private BigDecimal estoqueMinimo;

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
    public Produto(Empresa empresa, String nome, String categoria, String unidade, BigDecimal precoVenda,
            BigDecimal custo, BigDecimal estoqueMinimo, String codigoBarras, String sku) {
        this.empresa = empresa;
        this.ativo = true;
        atualizarDadosBasicos(nome, categoria, unidade, precoVenda, custo, estoqueMinimo, codigoBarras, sku);
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
     * de barras) ja terem sido feitas.
     */
    public void atualizarDadosBasicos(String nome, String categoria, String unidade, BigDecimal precoVenda,
            BigDecimal custo, BigDecimal estoqueMinimo, String codigoBarras, String sku) {
        this.nome = nome;
        this.categoria = categoria;
        this.unidade = unidade;
        this.precoVenda = precoVenda;
        this.custo = custo;
        this.estoqueMinimo = estoqueMinimo;
        this.codigoBarras = codigoBarras;
        this.sku = sku;
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

    public String getCategoria() {
        return categoria;
    }

    public String getUnidade() {
        return unidade;
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
