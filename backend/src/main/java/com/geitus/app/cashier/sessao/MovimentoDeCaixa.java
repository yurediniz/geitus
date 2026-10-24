package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

import com.geitus.app.cashier.FormaDePagamento;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Movimento de caixa (tabela {@code movimentos_caixa}, V16 e V17): uma
 * alteracao de valor na sessao, numa forma de pagamento. Nunca muda e nunca e
 * apagado: todas as colunas sao {@code updatable = false} e o gatilho
 * {@code tg_movimento_caixa_imutavel} recusa {@code UPDATE} e {@code DELETE}.
 * O esperado de cada forma e a soma dos movimentos dela com o sinal do tipo.
 *
 * <p>Abertura, suprimento e sangria sao da gaveta: sempre em dinheiro, com a
 * chave de idempotencia da tela. Recebimento e estorno sao do PDV: ligados a
 * venda, sem chave (a idempotencia e a da venda, DT-032).
 */
@Entity
@Table(name = "movimentos_caixa")
public class MovimentoDeCaixa {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID uuid;

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @Column(name = "sessao_caixa_id", nullable = false, updatable = false)
    private Long sessaoCaixaId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 15, updatable = false)
    private TipoDeMovimentoDeCaixa tipo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10, updatable = false)
    private FormaDePagamento forma;

    @Column(nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal valor;

    @Column(length = 200, updatable = false)
    private String motivo;

    @Column(name = "usuario_id", nullable = false, updatable = false)
    private Long usuarioId;

    /** Chave da tela nos movimentos da gaveta; {@code null} nos da venda. */
    @Column(name = "chave_idempotencia", updatable = false)
    private UUID chaveIdempotencia;

    /** Id interno da venda do recebimento ou do estorno; {@code null} nos da gaveta. */
    @Column(name = "venda_id", updatable = false)
    private Long vendaId;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private OffsetDateTime criadoEm;

    protected MovimentoDeCaixa() {
        // Construtor exigido pelo JPA.
    }

    /** Dados de um movimento novo da gaveta; o valor ja vem validado e na escala do dinheiro. */
    public record Lancamento(TipoDeMovimentoDeCaixa tipo, BigDecimal valor, String motivo, UUID chave) {
    }

    /** Dados de um recebimento ou estorno da venda; o valor ja vem na escala do dinheiro e e &gt; 0. */
    record DaVenda(TipoDeMovimentoDeCaixa tipo, FormaDePagamento forma, BigDecimal valor, Long vendaId) {
    }

    public MovimentoDeCaixa(SessaoDeCaixa sessao, Lancamento lancamento, Long usuarioId, OffsetDateTime agora) {
        this.uuid = UUID.randomUUID();
        this.empresaId = sessao.getEmpresaId();
        this.sessaoCaixaId = sessao.getId();
        this.tipo = lancamento.tipo();
        this.forma = FormaDePagamento.DINHEIRO;
        this.valor = lancamento.valor();
        this.motivo = lancamento.motivo();
        this.usuarioId = usuarioId;
        this.chaveIdempotencia = lancamento.chave();
        this.criadoEm = agora;
    }

    /** Recebimento ou estorno da venda na sessao (ja travada por quem chama). */
    static MovimentoDeCaixa daVenda(Long empresaId, Long sessaoId, DaVenda daVenda, Long usuarioId,
            OffsetDateTime agora) {
        MovimentoDeCaixa movimento = new MovimentoDeCaixa();
        movimento.uuid = UUID.randomUUID();
        movimento.empresaId = empresaId;
        movimento.sessaoCaixaId = sessaoId;
        movimento.tipo = daVenda.tipo();
        movimento.forma = daVenda.forma();
        movimento.valor = daVenda.valor();
        movimento.vendaId = daVenda.vendaId();
        movimento.usuarioId = usuarioId;
        movimento.criadoEm = agora;
        return movimento;
    }

    /** Mesma sessao, tipo, valor (10 = 10,00) e motivo: a repeticao do mesmo pedido. */
    public boolean mesmoLancamento(Long sessaoId, Lancamento lancamento) {
        return sessaoCaixaId.equals(sessaoId)
                && tipo == lancamento.tipo()
                && valor.compareTo(lancamento.valor()) == 0
                && Objects.equals(motivo, lancamento.motivo());
    }

    public UUID getUuid() {
        return uuid;
    }

    public Long getSessaoCaixaId() {
        return sessaoCaixaId;
    }

    public TipoDeMovimentoDeCaixa getTipo() {
        return tipo;
    }

    public FormaDePagamento getForma() {
        return forma;
    }

    /** Id interno da venda (recebimento e estorno), ou {@code null}. */
    public Long getVendaId() {
        return vendaId;
    }

    public BigDecimal getValor() {
        return valor;
    }

    public String getMotivo() {
        return motivo;
    }

    public Long getUsuarioId() {
        return usuarioId;
    }

    public OffsetDateTime getCriadoEm() {
        return criadoEm;
    }
}
