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
 * <p>Base minima do modulo Produtos (Etapa 7B1): apenas entidade, repository
 * e service, sem controller/endpoint ainda. Todo produto nasce vinculado a
 * uma empresa (tenant), conforme DEC-016, e nunca deve ser lido ou alterado
 * fora da empresa a que pertence.
 *
 * <p>Nao deve ser exposta diretamente na API: quando o controller for criado,
 * usar DTOs.
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

    public Produto(Empresa empresa, String nome, BigDecimal precoVenda) {
        this.empresa = empresa;
        this.nome = nome;
        this.precoVenda = precoVenda;
        this.ativo = true;
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

    public void setNome(String nome) {
        this.nome = nome;
    }

    public String getCategoria() {
        return categoria;
    }

    public void setCategoria(String categoria) {
        this.categoria = categoria;
    }

    public String getUnidade() {
        return unidade;
    }

    public void setUnidade(String unidade) {
        this.unidade = unidade;
    }

    public BigDecimal getPrecoVenda() {
        return precoVenda;
    }

    public void setPrecoVenda(BigDecimal precoVenda) {
        this.precoVenda = precoVenda;
    }

    public BigDecimal getCusto() {
        return custo;
    }

    public void setCusto(BigDecimal custo) {
        this.custo = custo;
    }

    public BigDecimal getEstoqueMinimo() {
        return estoqueMinimo;
    }

    public void setEstoqueMinimo(BigDecimal estoqueMinimo) {
        this.estoqueMinimo = estoqueMinimo;
    }

    public String getCodigoBarras() {
        return codigoBarras;
    }

    public void setCodigoBarras(String codigoBarras) {
        this.codigoBarras = codigoBarras;
    }

    public String getSku() {
        return sku;
    }

    public void setSku(String sku) {
        this.sku = sku;
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
