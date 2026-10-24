package com.geitus.app.cashier.ponto;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Ponto de caixa: a gaveta fisica de um balcao (tabela {@code pontos_caixa},
 * V16). Nunca e excluido, so inativado. O nome chega aqui ja aparado e
 * validado pelo {@link PontosDeCaixaService}; a unicidade sem diferenciar
 * maiusculas e garantida no banco ({@code uq_ponto_caixa_nome}).
 *
 * <p>Nao e exposta na API: usar {@code PontoDeCaixaResponse}.
 */
@Entity
@Table(name = "pontos_caixa")
public class PontoDeCaixa {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID uuid;

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @Column(nullable = false, length = 40)
    private String nome;

    @Column(nullable = false)
    private boolean ativo;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private OffsetDateTime criadoEm;

    @Column(name = "atualizado_em")
    private OffsetDateTime atualizadoEm;

    protected PontoDeCaixa() {
        // Construtor exigido pelo JPA.
    }

    public PontoDeCaixa(Long empresaId, String nome, OffsetDateTime agora) {
        this.uuid = UUID.randomUUID();
        this.empresaId = empresaId;
        this.nome = nome;
        this.ativo = true;
        this.criadoEm = agora;
    }

    public void renomear(String novoNome, OffsetDateTime agora) {
        this.nome = novoNome;
        this.atualizadoEm = agora;
    }

    public void inativar(OffsetDateTime agora) {
        this.ativo = false;
        this.atualizadoEm = agora;
    }

    public void reativar(OffsetDateTime agora) {
        this.ativo = true;
        this.atualizadoEm = agora;
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

    public String getNome() {
        return nome;
    }

    public boolean isAtivo() {
        return ativo;
    }
}
