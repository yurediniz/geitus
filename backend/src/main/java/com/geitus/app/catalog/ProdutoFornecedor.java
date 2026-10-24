package com.geitus.app.catalog;

import java.io.Serializable;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;

/**
 * Ligacao de um produto a um fornecedor que o vende (tabela
 * {@code produto_fornecedores}, V14; docs/modules/fornecedores-e-marcas.md,
 * 4.4 e 5): a mesma lista vista pelo produto e pelo fornecedor.
 *
 * <p>Guarda so o id interno do fornecedor, sem {@code @ManyToOne} para o
 * pacote {@code supplier}: o catalogo nao depende dele. Nome e numero do
 * fornecedor chegam pela interface {@code NomesDeFornecedores}. A empresa e a
 * do produto, e a FK composta da V14 recusa fornecedor de outra empresa.
 *
 * <p>Imutavel: a ligacao e criada ou apagada, nunca alterada.
 */
@Entity
@Table(name = "produto_fornecedores")
public class ProdutoFornecedor {

    @EmbeddedId
    private Chave chave;

    @MapsId("produtoId")
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "produto_id", nullable = false, updatable = false)
    private Produto produto;

    protected ProdutoFornecedor() {
        // Construtor exigido pelo JPA.
    }

    /** Liga {@code fornecedorId} (ja conferido na empresa do produto) ao produto. */
    ProdutoFornecedor(Produto produto, Long fornecedorId) {
        this.chave = new Chave(produto.getEmpresaId(), produto.getId(), Objects.requireNonNull(fornecedorId));
        this.produto = produto;
    }

    public Long getFornecedorId() {
        return chave.fornecedorId;
    }

    public Produto getProduto() {
        return produto;
    }

    /** PK composta {@code (empresa_id, produto_id, fornecedor_id)}. */
    @Embeddable
    public static class Chave implements Serializable {

        private static final long serialVersionUID = 1L;

        @Column(name = "empresa_id", nullable = false, updatable = false)
        private Long empresaId;

        @Column(name = "produto_id", nullable = false, updatable = false)
        private Long produtoId;

        @Column(name = "fornecedor_id", nullable = false, updatable = false)
        private Long fornecedorId;

        protected Chave() {
            // Construtor exigido pelo JPA.
        }

        Chave(Long empresaId, Long produtoId, Long fornecedorId) {
            this.empresaId = empresaId;
            this.produtoId = produtoId;
            this.fornecedorId = fornecedorId;
        }

        @Override
        public boolean equals(Object outro) {
            if (this == outro) {
                return true;
            }
            if (!(outro instanceof Chave chave)) {
                return false;
            }
            return Objects.equals(empresaId, chave.empresaId) && Objects.equals(produtoId, chave.produtoId)
                    && Objects.equals(fornecedorId, chave.fornecedorId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(empresaId, produtoId, fornecedorId);
        }
    }
}
