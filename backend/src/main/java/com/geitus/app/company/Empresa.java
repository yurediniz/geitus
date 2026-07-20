package com.geitus.app.company;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * Empresa (tenant) do Geitus.
 *
 * <p>Alem do nome (nome fantasia/exibicao usado no layout e no {@code /auth/me}),
 * concentra o cadastro completo: dados do representante legal
 * ({@link RepresentanteLegal}), dados de contato/fiscais e endereco
 * ({@link Endereco}). O fluxo "Ja possui CNPJ?" define o {@link TipoPessoa}
 * (FISICA sem CNPJ; JURIDICA com CNPJ + razao social).
 *
 * <p>A empresa continua sendo o tenant derivado do usuario autenticado
 * (DEC-016). Nao deve ser exposta diretamente na API: usar DTOs.
 */
@Entity
@Table(name = "empresa")
public class Empresa {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 150)
    private String nome;

    @Column(nullable = false, length = 20)
    private String telefone;

    @Column(nullable = false, length = 180)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_pessoa", nullable = false, length = 10)
    private TipoPessoa tipoPessoa;

    @Column(length = 14)
    private String cnpj;

    @Column(name = "razao_social", length = 180)
    private String razaoSocial;

    @Column(name = "inscricao_estadual", length = 20)
    private String inscricaoEstadual;

    @Embedded
    private RepresentanteLegal representanteLegal;

    @Embedded
    private Endereco endereco;

    @Column(nullable = false)
    private boolean ativo = true;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    @Column(name = "atualizado_em")
    private LocalDateTime atualizadoEm;

    protected Empresa() {
        // Construtor exigido pelo JPA.
    }

    /**
     * Construtor minimo (apenas nome). Util para criacao inicial e para testes
     * que nao persistem. O cadastro completo e preenchido depois via
     * {@link #atualizarCadastro}.
     */
    public Empresa(String nome) {
        this.nome = nome;
        this.ativo = true;
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
     * Atualiza os dados cadastrais da empresa. Chamado pelo {@code EmpresaService}
     * apos as validacoes de regra de negocio (coerencia PJ/PF, digitos de
     * CPF/CNPJ/telefone, normalizacao para somente digitos) ja terem sido feitas.
     * Nao altera {@code id}, {@code ativo} nem os timestamps.
     */
    public void atualizarCadastro(String nome, String telefone, String email, TipoPessoa tipoPessoa,
            String cnpj, String razaoSocial, String inscricaoEstadual,
            RepresentanteLegal representanteLegal, Endereco endereco) {
        this.nome = nome;
        this.telefone = telefone;
        this.email = email;
        this.tipoPessoa = tipoPessoa;
        this.cnpj = cnpj;
        this.razaoSocial = razaoSocial;
        this.inscricaoEstadual = inscricaoEstadual;
        this.representanteLegal = representanteLegal;
        this.endereco = endereco;
    }

    public Long getId() {
        return id;
    }

    public String getNome() {
        return nome;
    }

    public void setNome(String nome) {
        this.nome = nome;
    }

    public String getTelefone() {
        return telefone;
    }

    public String getEmail() {
        return email;
    }

    public TipoPessoa getTipoPessoa() {
        return tipoPessoa;
    }

    public String getCnpj() {
        return cnpj;
    }

    public String getRazaoSocial() {
        return razaoSocial;
    }

    public String getInscricaoEstadual() {
        return inscricaoEstadual;
    }

    public RepresentanteLegal getRepresentanteLegal() {
        return representanteLegal;
    }

    public Endereco getEndereco() {
        return endereco;
    }

    public boolean isAtivo() {
        return ativo;
    }

    public void setAtivo(boolean ativo) {
        this.ativo = ativo;
    }

    public LocalDateTime getCriadoEm() {
        return criadoEm;
    }

    public LocalDateTime getAtualizadoEm() {
        return atualizadoEm;
    }
}
