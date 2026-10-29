package com.geitus.app.sales.venda;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Devolucao de itens de uma venda ({@code devolucoes}, V19;
 * docs/modules/estoque.md, secao 6.2). Imutavel: o banco recusa alterar ou
 * apagar. A sessao e a de quem devolve (o reembolso sai dela), que pode nao ser
 * a da venda.
 */
@Entity
@Table(name = "devolucoes")
public class Devolucao {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID uuid;

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @Column(name = "venda_id", nullable = false, updatable = false)
    private Long vendaId;

    @Column(name = "sessao_caixa_id", nullable = false, updatable = false)
    private Long sessaoCaixaId;

    @Column(name = "usuario_id", nullable = false, updatable = false)
    private Long usuarioId;

    @Column(nullable = false, length = 200, updatable = false)
    private String motivo;

    @Column(nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal valor;

    @Column(name = "chave_idempotencia", nullable = false, updatable = false)
    private UUID chaveIdempotencia;

    @Column(name = "criada_em", nullable = false, updatable = false)
    private OffsetDateTime criadaEm;

    protected Devolucao() {
        // Construtor exigido pelo JPA.
    }

    /** Os dados de uma devolucao nova; o motivo ja vem aparado e o valor na escala do dinheiro. */
    record Origem(Long empresaId, Long vendaId, Long sessaoCaixaId, Long usuarioId, String motivo,
            BigDecimal valor, UUID chave, OffsetDateTime agora) {
    }

    Devolucao(Origem origem) {
        this.uuid = UUID.randomUUID();
        this.empresaId = origem.empresaId();
        this.vendaId = origem.vendaId();
        this.sessaoCaixaId = origem.sessaoCaixaId();
        this.usuarioId = origem.usuarioId();
        this.motivo = origem.motivo();
        this.valor = origem.valor();
        this.chaveIdempotencia = origem.chave();
        this.criadaEm = origem.agora();
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

    public Long getVendaId() {
        return vendaId;
    }

    public Long getSessaoCaixaId() {
        return sessaoCaixaId;
    }

    public Long getUsuarioId() {
        return usuarioId;
    }

    public String getMotivo() {
        return motivo;
    }

    public BigDecimal getValor() {
        return valor;
    }

    public UUID getChaveIdempotencia() {
        return chaveIdempotencia;
    }

    public OffsetDateTime getCriadaEm() {
        return criadaEm;
    }
}
