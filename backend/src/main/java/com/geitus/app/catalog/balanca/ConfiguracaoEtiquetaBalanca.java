package com.geitus.app.catalog.balanca;

import java.time.LocalDateTime;

import com.geitus.app.company.Empresa;

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
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * Configuracao da etiqueta de balanca gravada por uma empresa
 * (docs/modules/produtos.md; tabela
 * {@code configuracoes_etiqueta_balanca}, V11). No maximo uma por empresa
 * ({@code uq_etiqueta_empresa}); empresa sem linha usa
 * {@link ConfiguracaoEtiqueta#padrao()}.
 *
 * <p>Os campos so mudam por {@link #aplicar}, com a configuracao ja validada
 * pelo service. Nunca exposta na API: o controller usa DTOs.
 */
@Entity
@Table(name = "configuracoes_etiqueta_balanca")
public class ConfiguracaoEtiquetaBalanca {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "empresa_id", nullable = false, updatable = false)
    private Empresa empresa;

    @Column(nullable = false, length = 2)
    private String prefixo;

    @Column(name = "digitos_codigo", nullable = false)
    private short digitosCodigo;

    @Column(name = "digitos_preenchimento", nullable = false)
    private short digitosPreenchimento;

    @Enumerated(EnumType.STRING)
    @Column(name = "tipo_informacao", nullable = false, length = 10)
    private TipoInformacaoEtiqueta tipoInformacao;

    @Column(name = "digitos_informacao", nullable = false)
    private short digitosInformacao;

    @Column(name = "casas_decimais", nullable = false)
    private short casasDecimais;

    @Column(name = "digito_verificador", nullable = false)
    private boolean digitoVerificador;

    @Column(name = "atualizado_em", nullable = false)
    private LocalDateTime atualizadoEm;

    protected ConfiguracaoEtiquetaBalanca() {
        // Construtor exigido pelo JPA.
    }

    public ConfiguracaoEtiquetaBalanca(Empresa empresa, ConfiguracaoEtiqueta configuracao) {
        this.empresa = empresa;
        aplicar(configuracao);
    }

    /** Troca o formato pela configuracao informada, ja validada; devolve a propria entidade. */
    public ConfiguracaoEtiquetaBalanca aplicar(ConfiguracaoEtiqueta configuracao) {
        this.prefixo = configuracao.prefixo();
        this.digitosCodigo = (short) configuracao.digitosCodigo();
        this.digitosPreenchimento = (short) configuracao.digitosPreenchimento();
        this.tipoInformacao = configuracao.tipoInformacao();
        this.digitosInformacao = (short) configuracao.digitosInformacao();
        this.casasDecimais = (short) configuracao.casasDecimais();
        this.digitoVerificador = configuracao.digitoVerificador();
        return this;
    }

    @PrePersist
    @PreUpdate
    void carimbar() {
        this.atualizadoEm = LocalDateTime.now();
    }

    /** O formato gravado, como valor. */
    public ConfiguracaoEtiqueta configuracao() {
        return new ConfiguracaoEtiqueta(prefixo, digitosCodigo, digitosPreenchimento, tipoInformacao,
                digitosInformacao, casasDecimais, digitoVerificador);
    }

    public LocalDateTime getAtualizadoEm() {
        return atualizadoEm;
    }
}
