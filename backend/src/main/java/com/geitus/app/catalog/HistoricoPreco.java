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
 * {@code produto_historico_precos}, V8; docs/modules/produtos-precos.md, 4.6).
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

    @Column(name = "usuario_id", nullable = false, updatable = false)
    private Long usuarioId;

    @Column(name = "alterado_em", nullable = false, updatable = false)
    private LocalDateTime alteradoEm;

    protected HistoricoPreco() {
        // Construtor exigido pelo JPA.
    }

    /**
     * Registra uma mudanca real (o service so cria a linha quando o valor
     * mudou); a empresa vem do produto, que ja deve estar persistido.
     */
    public HistoricoPreco(Produto produto, CampoHistoricoPreco campo, BigDecimal valorAnterior,
            BigDecimal valorNovo, Long usuarioId) {
        this.produto = produto;
        this.empresaId = produto.getEmpresaId();
        this.campo = campo;
        this.valorAnterior = valorAnterior;
        this.valorNovo = valorNovo;
        this.usuarioId = usuarioId;
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

    public Long getUsuarioId() {
        return usuarioId;
    }

    public LocalDateTime getAlteradoEm() {
        return alteradoEm;
    }
}
