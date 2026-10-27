package com.geitus.app.customer;

import java.time.LocalDateTime;
import java.util.UUID;

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
 * Cliente (pessoa fisica) que compra da empresa.
 *
 * <p>Todo cliente nasce vinculado a uma empresa (tenant), conforme DEC-016, e
 * nunca deve ser lido ou alterado fora dela. A empresa e o {@code uuid} sao
 * imutaveis apos a criacao; os demais dados so mudam via {@link #atualizarDados}
 * (nao ha setters individuais), garantindo que as alteracoes passem pelas
 * regras do service.
 *
 * <p>O {@code id} e a PK interna (DEC-015) e nunca sai na API; o identificador
 * publico e o {@code uuid}, gerado aqui na criacao (DEC-019/029).
 *
 * <p>WhatsApp derivado (docs/modules/clientes.md): com
 * {@code telefoneEWhatsapp = true} o WhatsApp e o proprio telefone e a coluna
 * {@code whatsapp} deve ficar {@code null}; ela so guarda um numero diferente.
 * A entidade recebe os dados ja normalizados (o service descarta o
 * {@code whatsapp} nesse caso); o CHECK {@code ck_cliente_whatsapp_coerente} do
 * banco e a ultima barreira. Use {@link #getWhatsappResolvido()} para expor o
 * numero.
 *
 * <p>Fase B2 (V11, docs/modules/produtos.md): o
 * {@code numero} e o numero de registro 1, 2, 3... por empresa, gerado pelo
 * {@code Numerador} na criacao e imutavel ({@code updatable = false}; nao e a PK).
 *
 * <p>Nao deve ser exposta diretamente na API: o controller usa DTOs.
 */
@Entity
@Table(name = "clientes")
public class Cliente {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID uuid;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "empresa_id", nullable = false, updatable = false)
    private Empresa empresa;

    /** Fase B2 (V11): numero de registro por empresa, imutavel depois da criacao. */
    @Column(nullable = false, updatable = false)
    private Long numero;

    @Column(nullable = false, length = 150)
    private String nome;

    @Column(length = 11)
    private String cpf;

    @Column(length = 20)
    private String telefone;

    @Column(name = "telefone_e_whatsapp", nullable = false)
    private boolean telefoneEWhatsapp = true;

    @Column(length = 20)
    private String whatsapp;

    @Column(length = 500)
    private String observacoes;

    @Column(nullable = false)
    private boolean ativo = true;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    @Column(name = "atualizado_em")
    private LocalDateTime atualizadoEm;

    protected Cliente() {
        // Construtor exigido pelo JPA.
    }

    /**
     * Cria um cliente ativo, ja com o identificador publico gerado e o
     * {@code numero} de registro reservado pelo {@code Numerador} na mesma
     * transacao. O service e responsavel por validar e normalizar os dados
     * antes de instanciar.
     */
    public Cliente(Empresa empresa, long numero, String nome, String cpf, String telefone,
            boolean telefoneEWhatsapp, String whatsapp, String observacoes) {
        this.uuid = UUID.randomUUID();
        this.empresa = empresa;
        this.numero = numero;
        this.ativo = true;
        atualizarDados(nome, cpf, telefone, telefoneEWhatsapp, whatsapp, observacoes);
    }

    @PrePersist
    void aoCriar() {
        this.criadoEm = LocalDateTime.now();
    }

    @PreUpdate
    void aoAtualizar() {
        this.atualizadoEm = LocalDateTime.now();
    }

    /**
     * Atualiza os dados do cliente. Chamado pelo service apos a normalizacao
     * (somente digitos, vazio como {@code null}, {@code whatsapp} descartado
     * quando {@code telefoneEWhatsapp}) e as validacoes (CPF unico na empresa).
     */
    public void atualizarDados(String nome, String cpf, String telefone, boolean telefoneEWhatsapp,
            String whatsapp, String observacoes) {
        this.nome = nome;
        this.cpf = cpf;
        this.telefone = telefone;
        this.telefoneEWhatsapp = telefoneEWhatsapp;
        this.whatsapp = whatsapp;
        this.observacoes = observacoes;
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

    /** Numero de registro do cliente na empresa (1, 2, 3...), imutavel. */
    public Long getNumero() {
        return numero;
    }

    public String getNome() {
        return nome;
    }

    public String getCpf() {
        return cpf;
    }

    public String getTelefone() {
        return telefone;
    }

    public boolean isTelefoneEWhatsapp() {
        return telefoneEWhatsapp;
    }

    /** Valor bruto da coluna {@code whatsapp} (preenchido so quando difere do telefone). */
    public String getWhatsapp() {
        return whatsapp;
    }

    /**
     * Numero de WhatsApp a expor: o {@code telefone} quando ele e WhatsApp,
     * senao a coluna {@code whatsapp}. Pode ser {@code null}.
     */
    public String getWhatsappResolvido() {
        return telefoneEWhatsapp ? telefone : whatsapp;
    }

    public String getObservacoes() {
        return observacoes;
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
