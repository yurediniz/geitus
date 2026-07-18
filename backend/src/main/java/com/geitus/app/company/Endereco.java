package com.geitus.app.company;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * Endereco da empresa.
 *
 * <p>Modelado como {@link Embeddable} na propria {@link Empresa} (colunas
 * {@code endereco_*}). CEP e armazenado apenas com digitos (8). O {@code numero}
 * aceita um valor numerico ou {@code "S/N"} (sem numero). O {@code complemento}
 * e opcional; os demais campos sao obrigatorios.
 */
@Embeddable
public class Endereco {

    @Column(name = "endereco_cep", nullable = false, length = 8)
    private String cep;

    @Column(name = "endereco_logradouro", nullable = false, length = 180)
    private String logradouro;

    @Column(name = "endereco_numero", nullable = false, length = 20)
    private String numero;

    @Column(name = "endereco_complemento", length = 120)
    private String complemento;

    @Column(name = "endereco_bairro", nullable = false, length = 120)
    private String bairro;

    @Column(name = "endereco_municipio", nullable = false, length = 120)
    private String municipio;

    @Column(name = "endereco_uf", nullable = false, length = 2)
    private String uf;

    protected Endereco() {
        // Construtor exigido pelo JPA.
    }

    /**
     * Cria um endereco. Os valores ja devem chegar validados e normalizados
     * (CEP apenas com digitos) pelo {@code EmpresaService}.
     */
    public Endereco(String cep, String logradouro, String numero, String complemento,
            String bairro, String municipio, String uf) {
        this.cep = cep;
        this.logradouro = logradouro;
        this.numero = numero;
        this.complemento = complemento;
        this.bairro = bairro;
        this.municipio = municipio;
        this.uf = uf;
    }

    public String getCep() {
        return cep;
    }

    public String getLogradouro() {
        return logradouro;
    }

    public String getNumero() {
        return numero;
    }

    public String getComplemento() {
        return complemento;
    }

    public String getBairro() {
        return bairro;
    }

    public String getMunicipio() {
        return municipio;
    }

    public String getUf() {
        return uf;
    }
}
