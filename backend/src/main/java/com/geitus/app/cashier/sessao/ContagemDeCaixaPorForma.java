package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;

import com.geitus.app.cashier.FormaDePagamento;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Contagem de uma forma que nao e dinheiro (Debito, Credito ou PIX) no
 * fechamento da sessao (tabela {@code contagens_caixa}, V17;
 * docs/modules/pdv.md). O dinheiro continua nas colunas da propria
 * {@link SessaoDeCaixa}.
 *
 * <p>Fotografia imutavel: gravada uma vez, junto com a contagem e antes de a
 * sessao sair de {@code ABERTA}; o gatilho {@code tg_contagem_caixa_imutavel}
 * recusa alterar e apagar, e o {@code tg_contagem_caixa_coerente} confere que
 * a forma teve movimento e que o esperado e a soma deles.
 */
@Entity
@Table(name = "contagens_caixa")
public class ContagemDeCaixaPorForma {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @Column(name = "sessao_caixa_id", nullable = false, updatable = false)
    private Long sessaoCaixaId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10, updatable = false)
    private FormaDePagamento forma;

    @Column(name = "valor_esperado", nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal valorEsperado;

    @Column(name = "valor_contado", nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal valorContado;

    @Column(nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal diferenca;

    protected ContagemDeCaixaPorForma() {
        // Construtor exigido pelo JPA.
    }

    ContagemDeCaixaPorForma(SessaoDeCaixa sessao, FormaDePagamento forma, BigDecimal esperado, BigDecimal contado) {
        this.empresaId = sessao.getEmpresaId();
        this.sessaoCaixaId = sessao.getId();
        this.forma = forma;
        this.valorEsperado = esperado;
        this.valorContado = contado;
        this.diferenca = contado.subtract(esperado);
    }

    boolean temDiferenca() {
        return diferenca.signum() != 0;
    }

    public Long getSessaoCaixaId() {
        return sessaoCaixaId;
    }

    public FormaDePagamento getForma() {
        return forma;
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
}
