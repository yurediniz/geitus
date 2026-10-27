package com.geitus.app.supplier;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * Representante de venda do fornecedor (tabela {@code fornecedor_representantes},
 * V14; docs/modules/fornecedores-e-marcas.md): nome obrigatorio, telefone
 * (so digitos) e e-mail opcionais, na ordem da tela.
 *
 * <p>Parte do cadastro do fornecedor ({@code cascade} e {@code orphanRemoval}):
 * a empresa e a dele, e a FK composta da V14 garante isso no banco. O
 * {@code uuid} e o {@code id} publico do item na lista do request.
 */
@Entity
@Table(name = "fornecedor_representantes")
public class RepresentanteDeVenda {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID uuid;

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "fornecedor_id", nullable = false, updatable = false)
    private Fornecedor fornecedor;

    @Column(nullable = false, length = 120)
    private String nome;

    @Column(length = 20)
    private String telefone;

    @Column(length = 180)
    private String email;

    /** {@code SMALLINT} no banco (V14); mapeado como {@code short} para o {@code ddl-auto: validate}. */
    @Column(nullable = false)
    private short ordem;

    protected RepresentanteDeVenda() {
        // Construtor exigido pelo JPA.
    }

    RepresentanteDeVenda(Fornecedor fornecedor, DadosRepresentante dados, int ordem) {
        this.uuid = UUID.randomUUID();
        this.fornecedor = fornecedor;
        this.empresaId = fornecedor.getEmpresaId();
        atualizar(dados, ordem);
    }

    /** Dados ja normalizados e a posicao na lista. */
    void atualizar(DadosRepresentante dados, int ordem) {
        this.nome = dados.nome();
        this.telefone = dados.telefone();
        this.email = dados.email();
        this.ordem = (short) ordem;
    }

    public Long getId() {
        return id;
    }

    public UUID getUuid() {
        return uuid;
    }

    public String getNome() {
        return nome;
    }

    /** Telefone so com digitos, ou {@code null}. */
    public String getTelefone() {
        return telefone;
    }

    public String getEmail() {
        return email;
    }

    public int getOrdem() {
        return ordem;
    }
}
