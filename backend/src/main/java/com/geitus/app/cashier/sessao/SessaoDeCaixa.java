package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.geitus.app.cashier.ponto.PontoDeCaixa;

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
import jakarta.persistence.Table;

/**
 * Sessao de caixa (tabela {@code sessoes_caixa}, V16): o periodo entre a
 * abertura e o fechamento num ponto, aberta por um usuario.
 *
 * <p>Os dados da abertura nunca mudam ({@code updatable = false}, e o gatilho
 * {@code tg_sessao_caixa_protegida} tambem os protege). A contagem e uma
 * fotografia (esperado, contado, diferenca, modo, quem e quando) gravada uma
 * vez; o fechamento acrescenta a justificativa, quem fechou e quando. O banco
 * confere a coerencia de cada estado (CHECKs da V16).
 *
 * <p>Nao e exposta na API: usar {@code SessaoDeCaixaResponse}.
 */
@Entity
@Table(name = "sessoes_caixa")
public class SessaoDeCaixa {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID uuid;

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ponto_caixa_id", nullable = false, updatable = false)
    private PontoDeCaixa ponto;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 15)
    private StatusDaSessao status;

    @Column(name = "aberta_por", nullable = false, updatable = false)
    private Long abertaPor;

    @Column(name = "aberta_em", nullable = false, updatable = false)
    private OffsetDateTime abertaEm;

    @Column(name = "fundo_troco", nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal fundoTroco;

    @Column(name = "fechamento_cego")
    private Boolean fechamentoCego;

    @Column(name = "valor_esperado", precision = 12, scale = 2)
    private BigDecimal valorEsperado;

    @Column(name = "valor_contado", precision = 12, scale = 2)
    private BigDecimal valorContado;

    @Column(precision = 12, scale = 2)
    private BigDecimal diferenca;

    @Column(name = "contada_por")
    private Long contadaPor;

    @Column(name = "contada_em")
    private OffsetDateTime contadaEm;

    @Column(length = 500)
    private String justificativa;

    @Column(name = "fechada_por")
    private Long fechadaPor;

    @Column(name = "fechada_em")
    private OffsetDateTime fechadaEm;

    protected SessaoDeCaixa() {
        // Construtor exigido pelo JPA.
    }

    /** Sessao nova, {@code ABERTA}, no ponto ja travado e validado. */
    public SessaoDeCaixa(PontoDeCaixa ponto, Long abertaPor, BigDecimal fundoTroco, OffsetDateTime agora) {
        this.uuid = UUID.randomUUID();
        this.empresaId = ponto.getEmpresaId();
        this.ponto = ponto;
        this.status = StatusDaSessao.ABERTA;
        this.abertaPor = abertaPor;
        this.abertaEm = agora;
        this.fundoTroco = fundoTroco;
    }

    /** Contagem e fechamento por quem e quando. */
    public record Registro(Long usuarioId, OffsetDateTime em) {
    }

    /**
     * Grava a fotografia da contagem. Sem diferenca, a sessao fecha na hora;
     * com diferenca, fica {@code EM_CONFERENCIA} esperando a justificativa.
     * So em sessao {@code ABERTA} (quem chama confere o estado).
     */
    public void registrarContagem(BigDecimal esperado, BigDecimal contado, boolean cego, Registro registro) {
        this.fechamentoCego = cego;
        this.valorEsperado = esperado;
        this.valorContado = contado;
        this.diferenca = contado.subtract(esperado);
        this.contadaPor = registro.usuarioId();
        this.contadaEm = registro.em();
        if (diferenca.signum() == 0) {
            fecharCom(null, registro);
        } else {
            this.status = StatusDaSessao.EM_CONFERENCIA;
        }
    }

    /** Fecha a sessao em conferencia com a justificativa (quem chama confere o estado). */
    public void fechar(String justificativaDaDiferenca, Registro registro) {
        fecharCom(justificativaDaDiferenca, registro);
    }

    private void fecharCom(String justificativaDaDiferenca, Registro registro) {
        this.status = StatusDaSessao.FECHADA;
        this.justificativa = justificativaDaDiferenca;
        this.fechadaPor = registro.usuarioId();
        this.fechadaEm = registro.em();
    }

    public boolean abertaPor(Long usuarioId) {
        return abertaPor.equals(usuarioId);
    }

    public boolean contada() {
        return valorContado != null;
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

    public PontoDeCaixa getPonto() {
        return ponto;
    }

    public StatusDaSessao getStatus() {
        return status;
    }

    public Long getAbertaPor() {
        return abertaPor;
    }

    public OffsetDateTime getAbertaEm() {
        return abertaEm;
    }

    public BigDecimal getFundoTroco() {
        return fundoTroco;
    }

    public Boolean getFechamentoCego() {
        return fechamentoCego;
    }

    public BigDecimal getValorEsperado() {
        return valorEsperado;
    }

    public BigDecimal getValorContado() {
        return valorContado;
    }

    public BigDecimal getDiferenca() {
        return diferenca;
    }

    public Long getContadaPor() {
        return contadaPor;
    }

    public OffsetDateTime getContadaEm() {
        return contadaEm;
    }

    public String getJustificativa() {
        return justificativa;
    }

    public Long getFechadaPor() {
        return fechadaPor;
    }

    public OffsetDateTime getFechadaEm() {
        return fechadaEm;
    }
}
