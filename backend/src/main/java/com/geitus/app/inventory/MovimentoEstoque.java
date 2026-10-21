package com.geitus.app.inventory;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import com.geitus.app.catalog.Produto;

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
 * Movimento de estoque de um {@link Produto} (tabela {@code movimentos_estoque},
 * V9; docs/modules/produtos-estoque.md, 3.3).
 *
 * <p>Fonte de verdade do saldo e so de insercao: nenhuma coluna e atualizavel
 * e a aplicacao nunca altera um movimento; a correcao e um novo ajuste. A unica
 * remocao e a do estoque inicial na exclusao de produto cadastrado por engano
 * (spec 4.7). A empresa e copiada do produto; no banco, as FKs compostas
 * {@code (empresa_id, produto_id)} e {@code (empresa_id, usuario_id)} garantem
 * que produto e usuario sao da mesma empresa (DEC-016).
 */
@Entity
@Table(name = "movimentos_estoque")
public class MovimentoEstoque {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID uuid;

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "produto_id", nullable = false, updatable = false)
    private Produto produto;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10, updatable = false)
    private TipoMovimento tipo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30, updatable = false)
    private MotivoMovimento motivo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20, updatable = false)
    private OrigemMovimento origem;

    @Column(nullable = false, precision = 12, scale = 3, updatable = false)
    private BigDecimal quantidade;

    @Column(name = "saldo_anterior", nullable = false, precision = 12, scale = 3, updatable = false)
    private BigDecimal saldoAnterior;

    @Column(name = "saldo_novo", nullable = false, precision = 12, scale = 3, updatable = false)
    private BigDecimal saldoNovo;

    @Column(length = 200, updatable = false)
    private String observacao;

    @Column(name = "usuario_id", nullable = false, updatable = false)
    private Long usuarioId;

    @Column(name = "chave_idempotencia", updatable = false)
    private UUID chaveIdempotencia;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    protected MovimentoEstoque() {
        // Construtor exigido pelo JPA.
    }

    /**
     * Registra um movimento ja validado pelo servico de estoque; a empresa vem
     * do produto, que ja deve estar persistido. {@code quantidade} e a variacao
     * com sinal e {@code saldoNovo} e sempre {@code saldoAnterior + quantidade}
     * (CHECK {@code ck_movimento_estoque_coerencia}).
     */
    public MovimentoEstoque(Produto produto, TipoMovimento tipo, MotivoMovimento motivo, OrigemMovimento origem,
            BigDecimal quantidade, BigDecimal saldoAnterior, BigDecimal saldoNovo, String observacao,
            Long usuarioId, UUID chaveIdempotencia) {
        this.produto = produto;
        this.empresaId = produto.getEmpresaId();
        this.tipo = tipo;
        this.motivo = motivo;
        this.origem = origem;
        this.quantidade = quantidade;
        this.saldoAnterior = saldoAnterior;
        this.saldoNovo = saldoNovo;
        this.observacao = observacao;
        this.usuarioId = usuarioId;
        this.chaveIdempotencia = chaveIdempotencia;
    }

    @PrePersist
    void aoCriar() {
        this.uuid = UUID.randomUUID();
        this.criadoEm = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    /** Identificador publico do movimento nas respostas da API. */
    public UUID getUuid() {
        return uuid;
    }

    public Long getEmpresaId() {
        return empresaId;
    }

    public Produto getProduto() {
        return produto;
    }

    public TipoMovimento getTipo() {
        return tipo;
    }

    public MotivoMovimento getMotivo() {
        return motivo;
    }

    public OrigemMovimento getOrigem() {
        return origem;
    }

    /** Variacao com sinal: positiva na entrada, negativa na saida. */
    public BigDecimal getQuantidade() {
        return quantidade;
    }

    public BigDecimal getSaldoAnterior() {
        return saldoAnterior;
    }

    public BigDecimal getSaldoNovo() {
        return saldoNovo;
    }

    /** Observacao aparada, ou {@code null}. */
    public String getObservacao() {
        return observacao;
    }

    public Long getUsuarioId() {
        return usuarioId;
    }

    /** Chave de idempotencia enviada pela tela, ou {@code null} (estoque inicial). */
    public UUID getChaveIdempotencia() {
        return chaveIdempotencia;
    }

    public LocalDateTime getCriadoEm() {
        return criadoEm;
    }
}
