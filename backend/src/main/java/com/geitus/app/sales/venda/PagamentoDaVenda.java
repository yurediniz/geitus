package com.geitus.app.sales.venda;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

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
 * Pagamento da venda (tabela {@code pagamentos_venda}, V17;
 * docs/modules/pdv.md, 4.3): uma linha por forma, com o valor entregue (no
 * dinheiro, com o troco, que fica na venda). Imutavel.
 */
@Entity
@Table(name = "pagamentos_venda")
public class PagamentoDaVenda {

    private static final int CASAS_DO_REAL = 2;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @Column(name = "venda_id", nullable = false, updatable = false)
    private Long vendaId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10, updatable = false)
    private FormaDePagamento forma;

    @Column(nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal valor;

    protected PagamentoDaVenda() {
        // Construtor exigido pelo JPA.
    }

    PagamentoDaVenda(Venda venda, FormaDePagamento forma, BigDecimal valor) {
        this.empresaId = venda.getEmpresaId();
        this.vendaId = venda.getId();
        this.forma = forma;
        this.valor = valor.setScale(CASAS_DO_REAL, RoundingMode.UNNECESSARY);
    }

    /**
     * O que cada forma deixou no caixa (docs/modules/pdv.md, 3.4 e 3.8): o
     * valor da forma e, no dinheiro, o valor menos o troco; so as formas com
     * recebido &gt; 0. E o recebimento da venda e o estorno do cancelamento.
     */
    static Map<FormaDePagamento, BigDecimal> recebidos(List<PagamentoDaVenda> pagamentos, BigDecimal troco) {
        Map<FormaDePagamento, BigDecimal> recebidos = new EnumMap<>(FormaDePagamento.class);
        for (PagamentoDaVenda pagamento : pagamentos) {
            BigDecimal valor = pagamento.forma == FormaDePagamento.DINHEIRO
                    ? pagamento.valor.subtract(troco)
                    : pagamento.valor;
            if (valor.signum() > 0) {
                recebidos.put(pagamento.forma, valor);
            }
        }
        return recebidos;
    }

    public Long getVendaId() {
        return vendaId;
    }

    public FormaDePagamento getForma() {
        return forma;
    }

    public BigDecimal getValor() {
        return valor;
    }
}
