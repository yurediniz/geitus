package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * Embalagem de venda (ou de compra) de um {@link Produto} (tabela
 * {@code produto_embalagens}, V12; docs/modules/produtos-embalagens.md, 2).
 *
 * <p>Uma forma de vender ou comprar o mesmo produto, com estoque unico na
 * unidade de venda: a embalagem contem {@code quantidade} unidades de venda,
 * tem preco proprio opcional e ate 5 codigos de barras. Faz parte do cadastro
 * do produto: so e criada, alterada ou removida pelas regras do
 * {@code EmbalagensDoProduto}. A empresa e o produto sao imutaveis; no banco,
 * as FKs compostas garantem a mesma empresa do produto e da unidade (DEC-016).
 *
 * <p>O {@code uuid} (DEC-019) e o unico identificador exposto na API.
 */
@Entity
@Table(name = "produto_embalagens")
public class ProdutoEmbalagem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID uuid;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "empresa_id", nullable = false, updatable = false)
    private Empresa empresa;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "produto_id", nullable = false, updatable = false)
    private Produto produto;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "unidade_id", nullable = false)
    private UnidadeMedida unidade;

    /** Unidades de venda contidas na embalagem (maior que 1). */
    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal quantidade;

    /** Preco proprio; {@code null} = quantidade x preco vigente da unidade. */
    @Column(precision = 12, scale = 2)
    private BigDecimal preco;

    @Column(name = "de_compra", nullable = false)
    private boolean deCompra;

    /** {@code SMALLINT} no banco (V12); mapeado como {@code short} para o {@code ddl-auto: validate}. */
    @Column(nullable = false)
    private short ordem;

    @OneToMany(mappedBy = "embalagem", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("ordem")
    private List<ProdutoCodigoBarras> codigosBarras = new ArrayList<>();

    @Column(name = "criado_em", nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    @Column(name = "atualizado_em", nullable = false)
    private LocalDateTime atualizadoEm;

    protected ProdutoEmbalagem() {
        // Construtor exigido pelo JPA.
    }

    /** Embalagem nova do produto, ja validada; a empresa vem do produto e o uuid e gerado aqui. */
    ProdutoEmbalagem(Produto produto, DadosEmbalagem dados) {
        this.produto = produto;
        this.empresa = produto.getEmpresa();
        this.uuid = UUID.randomUUID();
        atualizar(dados);
    }

    @PrePersist
    void aoCriar() {
        this.criadoEm = LocalDateTime.now();
        this.atualizadoEm = criadoEm;
    }

    @PreUpdate
    void aoAtualizar() {
        this.atualizadoEm = LocalDateTime.now();
    }

    /** Aplica unidade, quantidade, preco, "de compra" e ordem ja validados. */
    void atualizar(DadosEmbalagem dados) {
        this.unidade = dados.unidade();
        this.quantidade = dados.quantidade();
        this.preco = dados.preco();
        this.deCompra = dados.deCompra();
        this.ordem = (short) dados.ordem();
    }

    /**
     * Fase 1 de um salvamento que libera a marca "de compra" para outra
     * embalagem: o indice unico parcial {@code uq_embalagem_de_compra} nao e
     * adiavel, entao a desmarcacao vai ao banco antes da nova marcacao.
     */
    void desmarcarDeCompra() {
        this.deCompra = false;
    }

    /** Substitui os codigos da embalagem, preservando a linha dos mantidos ({@link ListaDeCodigosDeBarras}). */
    void substituirCodigos(List<CodigoBarrasValidado> informados) {
        ListaDeCodigosDeBarras.substituir(codigosBarras, informados,
                (codigo, ordem) -> new ProdutoCodigoBarras(this, codigo.codigo(), codigo.formato(), ordem));
    }

    /** Fase 1: tira os codigos fora de {@code mantidos}, apagados no flush antes de outra lista inclui-los. */
    void removerCodigosForaDe(Set<String> mantidos) {
        ListaDeCodigosDeBarras.removerForaDe(codigosBarras, mantidos);
    }

    /** Rotulo derivado, ex.: "CX c/ 3 UN" ({@link RotuloDaEmbalagem}). */
    public String rotulo() {
        return RotuloDaEmbalagem.de(unidade.getSigla(), quantidade, produto.getUnidade().getSigla());
    }

    public Long getId() {
        return id;
    }

    /** Identificador publico da embalagem na API. */
    public UUID getUuid() {
        return uuid;
    }

    public Produto getProduto() {
        return produto;
    }

    Empresa getEmpresa() {
        return empresa;
    }

    public UnidadeMedida getUnidade() {
        return unidade;
    }

    public BigDecimal getQuantidade() {
        return quantidade;
    }

    /** Preco proprio, ou {@code null} (vale o preco calculado). */
    public BigDecimal getPreco() {
        return preco;
    }

    public boolean isDeCompra() {
        return deCompra;
    }

    public int getOrdem() {
        return ordem;
    }

    /** Codigos de barras da embalagem na ordem (somente leitura). */
    public List<ProdutoCodigoBarras> getCodigosBarras() {
        return Collections.unmodifiableList(codigosBarras);
    }

    public LocalDateTime getCriadoEm() {
        return criadoEm;
    }

    public LocalDateTime getAtualizadoEm() {
        return atualizadoEm;
    }
}
