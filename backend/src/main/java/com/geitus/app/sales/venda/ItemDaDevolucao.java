package com.geitus.app.sales.venda;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Uma linha da devolucao ({@code itens_devolucao}, V19): o item da venda, a
 * quantidade na unidade da linha, o que volta ao estoque (na unidade de venda),
 * o valor e o destino. Imutavel.
 */
@Entity
@Table(name = "itens_devolucao")
public class ItemDaDevolucao {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @Column(name = "devolucao_id", nullable = false, updatable = false)
    private Long devolucaoId;

    @Column(name = "venda_id", nullable = false, updatable = false)
    private Long vendaId;

    @Column(name = "produto_id", nullable = false, updatable = false)
    private Long produtoId;

    @Column(name = "item_venda_id", nullable = false, updatable = false)
    private Long itemVendaId;

    @Column(nullable = false, precision = 12, scale = 3, updatable = false)
    private BigDecimal quantidade;

    @Column(name = "quantidade_estoque", nullable = false, precision = 12, scale = 3, updatable = false)
    private BigDecimal quantidadeEstoque;

    @Column(nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal valor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10, updatable = false)
    private DestinoDaDevolucao destino;

    protected ItemDaDevolucao() {
        // Construtor exigido pelo JPA.
    }

    ItemDaDevolucao(Devolucao devolucao, ItemDaVenda item, CalculadoraDaDevolucao.LinhaDevolvida linha,
            DestinoDaDevolucao destino) {
        this.empresaId = devolucao.getEmpresaId();
        this.devolucaoId = devolucao.getId();
        this.vendaId = item.getVendaId();
        this.produtoId = item.getProdutoId();
        this.itemVendaId = item.getId();
        this.quantidade = linha.quantidade();
        this.quantidadeEstoque = linha.quantidadeEstoque();
        this.valor = linha.valor();
        this.destino = destino;
    }

    public Long getId() {
        return id;
    }

    public Long getDevolucaoId() {
        return devolucaoId;
    }

    public Long getProdutoId() {
        return produtoId;
    }

    public Long getItemVendaId() {
        return itemVendaId;
    }

    public BigDecimal getQuantidade() {
        return quantidade;
    }

    public BigDecimal getQuantidadeEstoque() {
        return quantidadeEstoque;
    }

    public BigDecimal getValor() {
        return valor;
    }

    public DestinoDaDevolucao getDestino() {
        return destino;
    }
}
