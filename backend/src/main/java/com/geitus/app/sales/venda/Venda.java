package com.geitus.app.sales.venda;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.geitus.app.sales.carrinho.CalculoDaVenda;
import com.geitus.app.sales.carrinho.MontagemDoCarrinho.ClienteDaVenda;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Venda concluida no PDV (tabela {@code vendas}, V17; docs/modules/pdv.md,
 * 4.1). Os dados da venda nunca mudam ({@code updatable = false}); so o
 * cancelamento acrescenta quem, quando e o motivo, e o gatilho
 * {@code tg_venda_protegida} recusa qualquer outra alteracao e a exclusao.
 *
 * <p>Nao e exposta na API: usar {@code VendaResponse}.
 */
@Entity
@Table(name = "vendas")
public class Venda {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID uuid;

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @Column(nullable = false, updatable = false)
    private Long numero;

    @Column(name = "sessao_caixa_id", nullable = false, updatable = false)
    private Long sessaoCaixaId;

    @Column(name = "usuario_id", nullable = false, updatable = false)
    private Long usuarioId;

    @Column(name = "cliente_id", updatable = false)
    private Long clienteId;

    @Column(name = "cliente_nome", length = 150, updatable = false)
    private String clienteNome;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private StatusDaVenda status;

    @Column(nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal subtotal;

    @Column(name = "desconto_itens", nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal descontoItens;

    @Column(name = "desconto_total", nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal descontoTotal;

    @Column(nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal total;

    @Column(nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal troco;

    @Column(name = "chave_idempotencia", nullable = false, updatable = false)
    private UUID chaveIdempotencia;

    @Column(name = "concluida_em", nullable = false, updatable = false)
    private OffsetDateTime concluidaEm;

    @Column(name = "cancelada_por")
    private Long canceladaPor;

    @Column(name = "cancelada_em")
    private OffsetDateTime canceladaEm;

    @Column(name = "motivo_cancelamento", length = 200)
    private String motivoCancelamento;

    protected Venda() {
        // Construtor exigido pelo JPA.
    }

    /** Quem, onde e quando: a sessao travada, o vendedor (dono da sessao), o numero e a chave do pedido. */
    record Origem(Long empresaId, Long sessaoId, Long usuarioId, long numero, UUID chave, OffsetDateTime agora) {
    }

    /** Venda nova, {@code CONCLUIDA}, com os totais do calculo e a fotografia do cliente. */
    Venda(Origem origem, CalculoDaVenda calculo, ClienteDaVenda cliente) {
        this.uuid = UUID.randomUUID();
        this.empresaId = origem.empresaId();
        this.numero = origem.numero();
        this.sessaoCaixaId = origem.sessaoId();
        this.usuarioId = origem.usuarioId();
        this.chaveIdempotencia = origem.chave();
        this.concluidaEm = origem.agora();
        this.status = StatusDaVenda.CONCLUIDA;
        this.subtotal = calculo.subtotal();
        this.descontoItens = calculo.descontoItens();
        this.descontoTotal = calculo.descontoTotal();
        this.total = calculo.total();
        this.troco = calculo.troco();
        if (cliente != null) {
            this.clienteId = cliente.id();
            this.clienteNome = cliente.nome();
        }
    }

    /** Cancela a venda concluida (quem chama confere a situacao, a sessao e o motivo). */
    void cancelar(Long usuarioId, OffsetDateTime agora, String motivo) {
        this.status = StatusDaVenda.CANCELADA;
        this.canceladaPor = usuarioId;
        this.canceladaEm = agora;
        this.motivoCancelamento = motivo;
    }

    boolean cancelada() {
        return status == StatusDaVenda.CANCELADA;
    }

    public Long getId() {
        return id;
    }

    public UUID getUuid() {
        return uuid;
    }

    public Long getEmpresaId() {
        return empresaId;
    }

    public Long getNumero() {
        return numero;
    }

    public Long getSessaoCaixaId() {
        return sessaoCaixaId;
    }

    public Long getUsuarioId() {
        return usuarioId;
    }

    public Long getClienteId() {
        return clienteId;
    }

    public String getClienteNome() {
        return clienteNome;
    }

    public StatusDaVenda getStatus() {
        return status;
    }

    public BigDecimal getSubtotal() {
        return subtotal;
    }

    public BigDecimal getDescontoItens() {
        return descontoItens;
    }

    public BigDecimal getDescontoTotal() {
        return descontoTotal;
    }

    public BigDecimal getTotal() {
        return total;
    }

    public BigDecimal getTroco() {
        return troco;
    }

    public UUID getChaveIdempotencia() {
        return chaveIdempotencia;
    }

    public OffsetDateTime getConcluidaEm() {
        return concluidaEm;
    }

    public Long getCanceladaPor() {
        return canceladaPor;
    }

    public OffsetDateTime getCanceladaEm() {
        return canceladaEm;
    }

    public String getMotivoCancelamento() {
        return motivoCancelamento;
    }
}
