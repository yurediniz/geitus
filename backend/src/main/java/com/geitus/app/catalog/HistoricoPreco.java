package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Alteracao de custo ou de preco de venda de um {@link Produto} (tabela
 * {@code produto_historico_precos}, V8; docs/modules/produtos.md).
 * Desde a V13 (Fase B4), as linhas de custo trazem a origem e, na entrada por
 * compra, o id do movimento de estoque.
 *
 * <p>So recebe insercoes: nenhuma coluna e atualizavel e a aplicacao nunca
 * apaga linhas (elas so saem em cascata com a exclusao do produto). A empresa
 * e copiada do produto; no banco, as FKs compostas {@code (empresa_id,
 * produto_id)} e {@code (empresa_id, usuario_id)} garantem que produto e
 * usuario sao da mesma empresa (DEC-016).
 */
@Entity
@Table(name = "produto_historico_precos")
public class HistoricoPreco {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "produto_id", nullable = false, updatable = false)
    private Produto produto;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, updatable = false)
    private CampoHistoricoPreco campo;

    @Column(name = "valor_anterior", precision = 12, scale = 2, updatable = false)
    private BigDecimal valorAnterior;

    @Column(name = "valor_novo", precision = 12, scale = 2, updatable = false)
    private BigDecimal valorNovo;

    /** So nas linhas de {@code PRECO_EMBALAGEM} (V12): o rotulo da embalagem no momento da alteracao. */
    @Column(name = "embalagem_rotulo", length = 60, updatable = false)
    private String embalagemRotulo;

    /** Fase B4 (V13): so (e sempre) nas linhas de {@code CUSTO}: de onde veio a alteracao. */
    @Enumerated(EnumType.STRING)
    @Column(length = 20, updatable = false)
    private OrigemDoCusto origem;

    /**
     * Fase B4 (V13): o id interno do movimento de estoque da entrada por
     * compra, so na origem {@code ENTRADA_COMPRA}. So o id: o catalogo nao
     * conhece a entidade do estoque.
     */
    @Column(name = "movimento_id", updatable = false)
    private Long movimentoId;

    @Column(name = "usuario_id", nullable = false, updatable = false)
    private Long usuarioId;

    @Column(name = "alterado_em", nullable = false, updatable = false)
    private LocalDateTime alteradoEm;

    protected HistoricoPreco() {
        // Construtor exigido pelo JPA.
    }

    /**
     * Registra uma mudanca real (o service so cria a linha quando o valor
     * mudou); a empresa vem do produto, que ja deve estar persistido. Privado:
     * cada campo tem a sua fabrica, com os dados que a V12 e a V13 exigem dele.
     */
    private HistoricoPreco(Produto produto, CampoHistoricoPreco campo, BigDecimal valorAnterior,
            BigDecimal valorNovo, Long usuarioId) {
        this.produto = produto;
        this.empresaId = produto.getEmpresaId();
        this.campo = campo;
        this.valorAnterior = valorAnterior;
        this.valorNovo = valorNovo;
        this.usuarioId = usuarioId;
    }

    /** Mudanca do preco de venda da unidade. */
    public static HistoricoPreco doPrecoDeVenda(Produto produto, BigDecimal valorAnterior, BigDecimal valorNovo,
            Long usuarioId) {
        return new HistoricoPreco(produto, CampoHistoricoPreco.PRECO_VENDA, valorAnterior, valorNovo, usuarioId);
    }

    /**
     * Mudanca do preco proprio de uma embalagem (Fase B3, 3.4). Sem FK para a
     * embalagem: a linha sobrevive a remocao dela, com o rotulo do momento.
     */
    public static HistoricoPreco daEmbalagem(Produto produto, String embalagemRotulo, BigDecimal valorAnterior,
            BigDecimal valorNovo, Long usuarioId) {
        HistoricoPreco linha = new HistoricoPreco(produto, CampoHistoricoPreco.PRECO_EMBALAGEM, valorAnterior,
                valorNovo, usuarioId);
        linha.embalagemRotulo = embalagemRotulo;
        return linha;
    }

    /**
     * Mudanca do custo (Fase B4, 3), com a origem e, na entrada por compra, o
     * id do movimento ({@code null} na edicao).
     */
    public static HistoricoPreco doCusto(Produto produto, OrigemDoCusto origem, BigDecimal valorAnterior,
            BigDecimal valorNovo, Long usuarioId, Long movimentoId) {
        HistoricoPreco linha = new HistoricoPreco(produto, CampoHistoricoPreco.CUSTO, valorAnterior, valorNovo,
                usuarioId);
        linha.origem = origem;
        linha.movimentoId = movimentoId;
        return linha;
    }

    @PrePersist
    void aoCriar() {
        this.alteradoEm = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public Long getEmpresaId() {
        return empresaId;
    }

    public Produto getProduto() {
        return produto;
    }

    public CampoHistoricoPreco getCampo() {
        return campo;
    }

    /** Valor antes da alteracao; {@code null} no cadastro ou quando o custo estava vazio. */
    public BigDecimal getValorAnterior() {
        return valorAnterior;
    }

    /** Valor depois da alteracao; {@code null} quando o custo foi removido. */
    public BigDecimal getValorNovo() {
        return valorNovo;
    }

    /** Rotulo da embalagem nas linhas de {@code PRECO_EMBALAGEM}; {@code null} nas demais. */
    public String getEmbalagemRotulo() {
        return embalagemRotulo;
    }

    /** Origem nas linhas de {@code CUSTO}; {@code null} nas demais. */
    public OrigemDoCusto getOrigem() {
        return origem;
    }

    /** Id interno do movimento da entrada por compra; {@code null} fora da origem {@code ENTRADA_COMPRA}. */
    public Long getMovimentoId() {
        return movimentoId;
    }

    public Long getUsuarioId() {
        return usuarioId;
    }

    public LocalDateTime getAlteradoEm() {
        return alteradoEm;
    }
}
