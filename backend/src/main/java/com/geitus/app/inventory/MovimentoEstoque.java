package com.geitus.app.inventory;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
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

    /** Fase B3 (V12): retrato da embalagem do ajuste em embalagens; os tres nulos ou os tres preenchidos. */
    @Column(name = "embalagem_rotulo", length = 60, updatable = false)
    private String embalagemRotulo;

    @Column(name = "embalagem_quantidade", precision = 12, scale = 3, updatable = false)
    private BigDecimal embalagemQuantidade;

    @Column(name = "quantidade_embalagens", updatable = false)
    private Integer quantidadeEmbalagens;

    /**
     * Fase B4 (V13): so na entrada manual por compra. O valor digitado (por
     * unidade, ou por embalagem com o retrato) e o custo por unidade de venda
     * com 4 casas; os dois nulos ou os dois preenchidos.
     */
    @Column(name = "custo_informado", precision = 12, scale = 2, updatable = false)
    private BigDecimal custoInformado;

    @Column(name = "custo_unitario", precision = 14, scale = 4, updatable = false)
    private BigDecimal custoUnitario;

    /**
     * Fase B5 (V14): id interno do fornecedor da entrada por compra, ou
     * {@code null}. A V14 so o aceita na entrada manual por compra.
     */
    @Column(name = "fornecedor_id", updatable = false)
    private Long fornecedorId;

    /**
     * PDV (V17): id interno do item da venda da baixa ({@code VENDA}) ou do
     * estorno ({@code CANCELAMENTO_VENDA}); {@code null} nos demais.
     */
    @Column(name = "item_venda_id", updatable = false)
    private Long itemVendaId;

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
        this(produto, tipo, motivo, origem, quantidade, saldoAnterior, saldoNovo, observacao, usuarioId,
                chaveIdempotencia, null);
    }

    /**
     * Como o construtor sem embalagem, com o retrato da embalagem do ajuste
     * informado em embalagens ({@code null} = em unidades). A V12 confere que
     * {@code |quantidade| = embalagens x unidades por embalagem}.
     */
    public MovimentoEstoque(Produto produto, TipoMovimento tipo, MotivoMovimento motivo, OrigemMovimento origem,
            BigDecimal quantidade, BigDecimal saldoAnterior, BigDecimal saldoNovo, String observacao,
            Long usuarioId, UUID chaveIdempotencia, RetratoDaEmbalagem embalagem) {
        this(produto, tipo, motivo, origem, quantidade, saldoAnterior, saldoNovo, observacao, usuarioId,
                chaveIdempotencia, embalagem, null);
    }

    /**
     * Fase B4: como o construtor com embalagem, com o custo da entrada por
     * compra ({@code null} = sem custo). A V13 confere que so a entrada manual
     * por compra tem custo e a coerencia do por unidade com o retrato.
     */
    MovimentoEstoque(Produto produto, TipoMovimento tipo, MotivoMovimento motivo, OrigemMovimento origem,
            BigDecimal quantidade, BigDecimal saldoAnterior, BigDecimal saldoNovo, String observacao,
            Long usuarioId, UUID chaveIdempotencia, RetratoDaEmbalagem embalagem, CustoDaCompra custo) {
        this(produto, tipo, motivo, origem, quantidade, saldoAnterior, saldoNovo, observacao, usuarioId,
                chaveIdempotencia, embalagem, custo, null);
    }

    /**
     * Fase B5: como o construtor com custo, com o fornecedor da entrada por
     * compra (id interno ja conferido na empresa; {@code null} = sem). A V14 so
     * o aceita na entrada manual por compra.
     */
    MovimentoEstoque(Produto produto, TipoMovimento tipo, MotivoMovimento motivo, OrigemMovimento origem,
            BigDecimal quantidade, BigDecimal saldoAnterior, BigDecimal saldoNovo, String observacao,
            Long usuarioId, UUID chaveIdempotencia, RetratoDaEmbalagem embalagem, CustoDaCompra custo,
            Long fornecedorId) {
        this.produto = produto;
        this.fornecedorId = fornecedorId;
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
        if (embalagem != null) {
            this.embalagemRotulo = embalagem.rotulo();
            this.embalagemQuantidade = embalagem.quantidadePorEmbalagem();
            this.quantidadeEmbalagens = embalagem.quantidadeDeEmbalagens();
        }
        if (custo != null) {
            this.custoInformado = custo.informado();
            this.custoUnitario = custo.porUnidade();
        }
    }

    /**
     * PDV: a baixa ou o estorno de um item de venda (origem {@code VENDA}, sem
     * chave: a idempotencia e a da venda, DT-032).
     */
    static MovimentoEstoque daVenda(Produto produto, TipoMovimento tipo, MotivoMovimento motivo,
            BigDecimal quantidade, BigDecimal saldoAnterior, BigDecimal saldoNovo, Long usuarioId, Long itemVendaId) {
        MovimentoEstoque movimento = new MovimentoEstoque(produto, tipo, motivo, OrigemMovimento.VENDA, quantidade,
                saldoAnterior, saldoNovo, null, usuarioId, null);
        movimento.itemVendaId = itemVendaId;
        return movimento;
    }

    @PrePersist
    void aoCriar() {
        this.uuid = UUID.randomUUID();
        // Na precisao do TIMESTAMP do PostgreSQL: a resposta do ajuste e a da
        // repeticao pela chave (lida do banco) trazem o mesmo instante.
        this.criadoEm = LocalDateTime.now().truncatedTo(ChronoUnit.MICROS);
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

    /**
     * A quantidade como o usuario a informou: a da entrada ou da saida (sem
     * sinal) ou, no ajuste, o saldo contado. Usada para reconhecer a repeticao
     * do mesmo pedido pela chave de idempotencia.
     */
    public BigDecimal quantidadeInformada() {
        return switch (tipo) {
            case ENTRADA -> quantidade;
            case SAIDA -> quantidade.negate();
            case AJUSTE -> saldoNovo;
        };
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

    /** Retrato da embalagem, se o ajuste foi informado em embalagens. */
    public Optional<RetratoDaEmbalagem> getRetratoDaEmbalagem() {
        if (embalagemRotulo == null) {
            return Optional.empty();
        }
        return Optional.of(new RetratoDaEmbalagem(embalagemRotulo, embalagemQuantidade, quantidadeEmbalagens));
    }

    /** Custo digitado na entrada por compra (por unidade ou por embalagem), ou {@code null}. */
    public BigDecimal getCustoInformado() {
        return custoInformado;
    }

    /** Custo por unidade de venda, com 4 casas, ou {@code null} sem custo. */
    public BigDecimal getCustoUnitario() {
        return custoUnitario;
    }

    /** Id interno do fornecedor da entrada por compra, ou {@code null}. */
    public Long getFornecedorId() {
        return fornecedorId;
    }

    /** Id interno do item de venda (PDV), ou {@code null}. */
    public Long getItemVendaId() {
        return itemVendaId;
    }

    public LocalDateTime getCriadoEm() {
        return criadoEm;
    }
}
