package com.geitus.app.sales.venda;

import java.math.BigDecimal;
import java.math.RoundingMode;

import com.geitus.app.sales.carrinho.LinhaCalculada;
import com.geitus.app.sales.carrinho.OrigemPrecoDaVenda;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Item da venda (tabela {@code itens_venda}, V17; docs/modules/pdv.md, 4.2):
 * a fotografia do que foi vendido, com o produto (FK {@code RESTRICT}), o
 * retrato da embalagem sem FK, o preco, a origem, os descontos e o custo na
 * data. Imutavel: todas as colunas sao {@code updatable = false} e o gatilho
 * {@code tg_item_venda_imutavel} recusa alterar e apagar. O custo nunca sai na
 * API.
 */
@Entity
@Table(name = "itens_venda")
public class ItemDaVenda {

    private static final int CASAS_DO_CUSTO = 4;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @Column(name = "venda_id", nullable = false, updatable = false)
    private Long vendaId;

    @Column(nullable = false, updatable = false)
    private short ordem;

    @Column(name = "produto_id", nullable = false, updatable = false)
    private Long produtoId;

    @Column(name = "produto_nome", nullable = false, length = 150, updatable = false)
    private String produtoNome;

    @Column(name = "codigo_lido", length = 60, updatable = false)
    private String codigoLido;

    @Column(name = "unidade_sigla", nullable = false, length = 20, updatable = false)
    private String unidadeSigla;

    @Column(name = "embalagem_rotulo", length = 60, updatable = false)
    private String embalagemRotulo;

    @Column(name = "embalagem_quantidade", precision = 12, scale = 3, updatable = false)
    private BigDecimal embalagemQuantidade;

    @Column(nullable = false, updatable = false)
    private boolean etiqueta;

    @Column(nullable = false, precision = 12, scale = 3, updatable = false)
    private BigDecimal quantidade;

    @Column(name = "quantidade_estoque", nullable = false, precision = 12, scale = 3, updatable = false)
    private BigDecimal quantidadeEstoque;

    @Column(name = "preco_unitario", nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal precoUnitario;

    @Enumerated(EnumType.STRING)
    @Column(name = "origem_preco", nullable = false, length = 12, updatable = false)
    private OrigemPrecoDaVenda origemPreco;

    @Column(name = "valor_bruto", nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal valorBruto;

    @Column(name = "desconto_item", nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal descontoItem;

    @Column(name = "desconto_rateado", nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal descontoRateado;

    @Column(name = "valor_liquido", nullable = false, precision = 12, scale = 2, updatable = false)
    private BigDecimal valorLiquido;

    @Column(name = "custo_unitario", precision = 12, scale = 4, updatable = false)
    private BigDecimal custoUnitario;

    protected ItemDaVenda() {
        // Construtor exigido pelo JPA.
    }

    /** A linha calculada, fotografada na venda ja gravada. */
    ItemDaVenda(Venda venda, LinhaCalculada linha) {
        this.empresaId = venda.getEmpresaId();
        this.vendaId = venda.getId();
        this.ordem = (short) linha.ordem();
        this.produtoId = linha.produto().getId();
        this.produtoNome = linha.produto().getNome();
        this.codigoLido = linha.codigoLido();
        this.unidadeSigla = linha.sigla();
        if (linha.embalagem() != null) {
            this.embalagemRotulo = linha.embalagem().rotulo();
            this.embalagemQuantidade = linha.embalagem().getQuantidade();
        }
        this.etiqueta = linha.etiqueta();
        this.quantidade = linha.quantidade();
        this.quantidadeEstoque = linha.quantidadeEstoque();
        this.precoUnitario = linha.precoUnitario();
        this.origemPreco = linha.origem();
        this.valorBruto = linha.valorBruto();
        this.descontoItem = linha.descontoItem();
        this.descontoRateado = linha.descontoRateado();
        this.valorLiquido = linha.valorLiquido();
        BigDecimal custo = linha.produto().getCusto();
        this.custoUnitario = custo == null ? null : custo.setScale(CASAS_DO_CUSTO, RoundingMode.HALF_UP);
    }

    public Long getId() {
        return id;
    }

    public Long getVendaId() {
        return vendaId;
    }

    public int getOrdem() {
        return ordem;
    }

    public Long getProdutoId() {
        return produtoId;
    }

    public String getProdutoNome() {
        return produtoNome;
    }

    public String getCodigoLido() {
        return codigoLido;
    }

    public String getUnidadeSigla() {
        return unidadeSigla;
    }

    public String getEmbalagemRotulo() {
        return embalagemRotulo;
    }

    public BigDecimal getEmbalagemQuantidade() {
        return embalagemQuantidade;
    }

    public boolean isEtiqueta() {
        return etiqueta;
    }

    public BigDecimal getQuantidade() {
        return quantidade;
    }

    public BigDecimal getQuantidadeEstoque() {
        return quantidadeEstoque;
    }

    public BigDecimal getPrecoUnitario() {
        return precoUnitario;
    }

    public OrigemPrecoDaVenda getOrigemPreco() {
        return origemPreco;
    }

    public BigDecimal getValorBruto() {
        return valorBruto;
    }

    public BigDecimal getDescontoItem() {
        return descontoItem;
    }

    public BigDecimal getDescontoRateado() {
        return descontoRateado;
    }

    public BigDecimal getValorLiquido() {
        return valorLiquido;
    }

    /** Custo por unidade de estoque na data; uso interno (nunca sai na API). */
    BigDecimal getCustoUnitario() {
        return custoUnitario;
    }
}
