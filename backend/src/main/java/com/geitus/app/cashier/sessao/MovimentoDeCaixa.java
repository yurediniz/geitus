package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Movimento de caixa (tabela {@code movimentos_caixa}, V16): uma alteracao de
 * dinheiro na sessao. Nunca muda e nunca e apagado: todas as colunas sao
 * {@code updatable = false} e o gatilho {@code tg_movimento_caixa_imutavel}
 * recusa {@code UPDATE} e {@code DELETE}. O esperado da gaveta e a soma dos
 * movimentos com o sinal do tipo.
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

    @Column(nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal valor;

    @Column(length = 200, updatable = false)
    private String motivo;

    @Column(name = "usuario_id", nullable = false, updatable = false)
    private Long usuarioId;

    @Column(name = "chave_idempotencia", nullable = false, updatable = false)
    private UUID chaveIdempotencia;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private OffsetDateTime criadoEm;

    protected MovimentoDeCaixa() {
        // Construtor exigido pelo JPA.
    }

    /** Dados de um movimento novo; o valor ja vem validado e na escala do dinheiro. */
    public record Lancamento(TipoDeMovimentoDeCaixa tipo, BigDecimal valor, String motivo, UUID chave) {
    }

    public MovimentoDeCaixa(SessaoDeCaixa sessao, Lancamento lancamento, Long usuarioId, OffsetDateTime agora) {
        this.uuid = UUID.randomUUID();
        this.empresaId = sessao.getEmpresaId();
        this.sessaoCaixaId = sessao.getId();
        this.tipo = lancamento.tipo();
        this.valor = lancamento.valor();
        this.motivo = lancamento.motivo();
        this.usuarioId = usuarioId;
        this.chaveIdempotencia = lancamento.chave();
        this.criadoEm = agora;
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
