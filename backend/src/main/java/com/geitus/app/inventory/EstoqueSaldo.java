package com.geitus.app.inventory;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Saldo atual de um produto (tabela {@code estoque_saldos}, V9;
 * docs/modules/produtos-estoque.md, 3.2).
 *
 * <p>A linha nasce no banco pelo {@code INSERT ... ON CONFLICT DO NOTHING} de
 * {@link EstoqueSaldoRepository#garantirLinha} (nunca por {@code persist}) e e
 * lida com trava de escrita antes de cada movimento; so {@link #aplicar} muda o
 * saldo, na mesma transacao do movimento. Sem linha, o saldo do produto e 0.
 * Os ids de empresa e produto sao imutaveis e mapeados como colunas simples: o
 * saldo nunca navega ate o produto.
 */
@Entity
@Table(name = "estoque_saldos")
public class EstoqueSaldo {

    @Id
    private Long id;

    @Column(name = "empresa_id", nullable = false, insertable = false, updatable = false)
    private Long empresaId;

    @Column(name = "produto_id", nullable = false, insertable = false, updatable = false)
    private Long produtoId;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal saldo;

    @Column(name = "atualizado_em", nullable = false)
    private LocalDateTime atualizadoEm;

    protected EstoqueSaldo() {
        // Construtor exigido pelo JPA.
    }

    /**
     * Soma a variacao (com sinal) ao saldo e carimba o momento. O servico ja
     * garantiu que o resultado nao e negativo; o CHECK
     * {@code ck_estoque_saldo_nao_negativo} e a ultima barreira.
     */
    public void aplicar(BigDecimal variacao) {
        this.saldo = saldo.add(variacao);
        this.atualizadoEm = LocalDateTime.now();
    }

    public Long getEmpresaId() {
        return empresaId;
    }

    public Long getProdutoId() {
        return produtoId;
    }

    public BigDecimal getSaldo() {
        return saldo;
    }

    public LocalDateTime getAtualizadoEm() {
        return atualizadoEm;
    }
}
