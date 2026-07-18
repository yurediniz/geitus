package com.geitus.app.company;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * Representante legal da empresa (sempre obrigatorio).
 *
 * <p>Dados pessoais do responsavel pela empresa. Modelado como
 * {@link Embeddable} na propria {@link Empresa} (colunas {@code representante_*}):
 * nesta fase nao ha necessidade de uma entidade reutilizavel — vira entidade
 * quando o dominio exigir (ver {@code docs/modules/empresa.md}).
 *
 * <p>O CPF e armazenado apenas com digitos (sem mascara) e NAO e unico: uma
 * mesma pessoa pode representar mais de uma empresa. Os dados nunca sao expostos
 * diretamente: o controller usa DTOs.
 */
@Embeddable
public class RepresentanteLegal {

    @Column(name = "representante_nome", nullable = false, length = 180)
    private String nome;

    @Column(name = "representante_cpf", nullable = false, length = 11)
    private String cpf;

    @Column(name = "representante_telefone", nullable = false, length = 20)
    private String telefone;

    @Column(name = "representante_email", nullable = false, length = 180)
    private String email;

    protected RepresentanteLegal() {
        // Construtor exigido pelo JPA.
    }

    /**
     * Cria um representante legal. Os valores ja devem chegar validados e
     * normalizados (CPF/telefone apenas com digitos) pelo {@code EmpresaService}.
     */
    public RepresentanteLegal(String nome, String cpf, String telefone, String email) {
        this.nome = nome;
        this.cpf = cpf;
        this.telefone = telefone;
        this.email = email;
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

    public String getEmail() {
        return email;
    }
}
