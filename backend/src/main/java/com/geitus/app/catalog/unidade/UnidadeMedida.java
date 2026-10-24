package com.geitus.app.catalog.unidade;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import org.hibernate.annotations.BatchSize;

import com.geitus.app.company.Empresa;

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
 * Unidade de medida de uma empresa (ex.: UN, KG, CX), usada como unidade de
 * venda e nas embalagens do produto
 * (docs/modules/categorias-e-unidades.md, secao 3).
 *
 * <p>Pertence a uma empresa (DEC-016); empresa e {@code uuid} sao imutaveis. O
 * {@code id} e a PK interna (DEC-015), nunca exposta; o identificador publico
 * e o {@code uuid}, gerado aqui (DEC-019/029). A sigla chega ja normalizada
 * pelo service (maiusculas, sem espacos nas pontas); o CHECK
 * {@code ck_unidade_sigla_maiuscula} do banco e a ultima barreira.
 *
 * <p>Nao deve ser exposta diretamente na API: o controller usa DTOs.
 *
 * <p>{@code @BatchSize}: as unidades das embalagens de um produto (Fase B3)
 * sao carregadas numa consulta so, e nao uma por embalagem.
 */
@Entity
@BatchSize(size = UnidadeMedida.TAMANHO_DO_LOTE)
@Table(name = "unidades_medida")
public class UnidadeMedida {

    /** Unidades carregadas por consulta quando varios proxies sao inicializados (embalagens). */
    static final int TAMANHO_DO_LOTE = 25;

    private static final String MENSAGEM_SEM_FRACAO = "A unidade %s não aceita quantidade fracionada.";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID uuid;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "empresa_id", nullable = false, updatable = false)
    private Empresa empresa;

    @Column(nullable = false, length = 20)
    private String sigla;

    @Column(nullable = false, length = 60)
    private String descricao;

    @Column(nullable = false)
    private boolean fracionada;

    @Column(nullable = false)
    private boolean ativo = true;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    @Column(name = "atualizado_em")
    private LocalDateTime atualizadoEm;

    protected UnidadeMedida() {
        // Construtor exigido pelo JPA.
    }

    /** Cria uma unidade ativa, ja com o identificador publico gerado. */
    public UnidadeMedida(Empresa empresa, String sigla, String descricao, boolean fracionada) {
        this.uuid = UUID.randomUUID();
        this.empresa = empresa;
        this.ativo = true;
        atualizar(sigla, descricao, fracionada);
    }

    /**
     * Regra de dominio para o PDV (spec 3.3): a quantidade deve ser positiva e,
     * se a unidade nao for fracionada, inteira ({@code 1.000} conta como
     * inteira; {@code 1.5} nao). Ainda sem consumidor nesta fase.
     */
    public static boolean quantidadeValida(boolean fracionada, BigDecimal quantidade) {
        if (quantidade == null || quantidade.signum() <= 0) {
            return false;
        }
        return fracionada || quantidade.stripTrailingZeros().scale() <= 0;
    }

    /** Mensagem de quantidade fracionada numa unidade que nao aceita fracao (ex.: "A unidade UN ..."). */
    public static String mensagemSemFracao(String sigla) {
        return MENSAGEM_SEM_FRACAO.formatted(sigla);
    }

    @PrePersist
    void aoCriar() {
        this.criadoEm = LocalDateTime.now();
    }

    @PreUpdate
    void aoAtualizar() {
        this.atualizadoEm = LocalDateTime.now();
    }

    public void atualizar(String sigla, String descricao, boolean fracionada) {
        this.sigla = sigla;
        this.descricao = descricao;
        this.fracionada = fracionada;
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

    public UUID getUuid() {
        return uuid;
    }

    public Long getEmpresaId() {
        return empresa == null ? null : empresa.getId();
    }

    public String getSigla() {
        return sigla;
    }

    public String getDescricao() {
        return descricao;
    }

    public boolean isFracionada() {
        return fracionada;
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
