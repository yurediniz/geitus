package com.geitus.app.catalog.categoria;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

import com.geitus.app.catalog.arvore.NoDaArvore;
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
 * Categoria de produtos em arvore (docs/modules/produtos.md).
 * {@code pai == null} indica categoria raiz.
 *
 * <p>Pertence a uma empresa (DEC-016); empresa e {@code uuid} sao imutaveis, e
 * o pai deve ser sempre da mesma empresa (verificado aqui como defesa extra,
 * alem do service). O {@code id} e a PK interna (DEC-015); o identificador
 * publico e o {@code uuid} (DEC-019/029).
 *
 * <p>Regras que dependem da arvore inteira (ciclos, caminho, ramo inativo)
 * ficam em {@link CategoriaArvore}. Nao deve ser exposta na API.
 */
@Entity
@Table(name = "categorias")
public class Categoria implements NoDaArvore {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID uuid;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "empresa_id", nullable = false, updatable = false)
    private Empresa empresa;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Categoria pai;

    @Column(nullable = false, length = 100)
    private String nome;

    @Column(nullable = false)
    private boolean ativo = true;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    @Column(name = "atualizado_em")
    private LocalDateTime atualizadoEm;

    protected Categoria() {
        // Construtor exigido pelo JPA.
    }

    /** Cria uma categoria ativa sob {@code pai} ({@code null} = raiz). */
    public Categoria(Empresa empresa, Categoria pai, String nome) {
        this.uuid = UUID.randomUUID();
        this.empresa = empresa;
        this.ativo = true;
        renomear(nome);
        moverPara(pai);
    }

    @PrePersist
    void aoCriar() {
        this.criadoEm = LocalDateTime.now();
    }

    @PreUpdate
    void aoAtualizar() {
        this.atualizadoEm = LocalDateTime.now();
    }

    public void renomear(String nome) {
        this.nome = nome;
    }

    /**
     * Move a categoria para {@code novoPai} ({@code null} = raiz). Ciclos
     * indiretos sao barrados pelo service via {@link CategoriaArvore#criariaCiclo};
     * aqui so se impede o caso trivial e o pai de outra empresa.
     */
    public void moverPara(Categoria novoPai) {
        if (novoPai != null) {
            if (novoPai == this) {
                throw new IllegalArgumentException("Uma categoria não pode ser pai de si mesma.");
            }
            if (!Objects.equals(novoPai.getEmpresaId(), getEmpresaId())) {
                throw new IllegalArgumentException("A categoria pai deve ser da mesma empresa.");
            }
        }
        this.pai = novoPai;
    }

    public void inativar() {
        this.ativo = false;
    }

    public void ativar() {
        this.ativo = true;
    }

    @Override
    public Long getId() {
        return id;
    }

    @Override
    public UUID getUuid() {
        return uuid;
    }

    public Long getEmpresaId() {
        return empresa == null ? null : empresa.getId();
    }

    /** Categoria pai, ou {@code null} se for raiz. */
    public Categoria getPai() {
        return pai;
    }

    /** Id interno do pai, ou {@code null} se for raiz. */
    @Override
    public Long getPaiId() {
        return pai == null ? null : pai.getId();
    }

    /** UUID publico do pai, ou {@code null} se for raiz. */
    public UUID getPaiUuid() {
        return pai == null ? null : pai.getUuid();
    }

    @Override
    public String getNome() {
        return nome;
    }

    @Override
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
