package com.geitus.app.supplier;

import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * Uma marca que o fornecedor vende (linha de {@code fornecedor_marcas}, V14;
 * docs/modules/fornecedores-e-marcas.md).
 *
 * <p>Elemento da colecao do {@link Fornecedor} ({@code @ElementCollection}) e
 * nao um {@code @ManyToMany}: a tabela de ligacao tem a {@code empresa_id} na
 * PK, para as FKs compostas que barram marca de outra empresa no banco, e o
 * {@code @ManyToMany} nao a preencheria. Guarda so os ids internos.
 */
@Embeddable
public class MarcaDoFornecedor {

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @Column(name = "marca_id", nullable = false, updatable = false)
    private Long marcaId;

    protected MarcaDoFornecedor() {
        // Construtor exigido pelo JPA.
    }

    MarcaDoFornecedor(Long empresaId, Long marcaId) {
        this.empresaId = Objects.requireNonNull(empresaId);
        this.marcaId = Objects.requireNonNull(marcaId);
    }

    public Long getMarcaId() {
        return marcaId;
    }

    @Override
    public boolean equals(Object outro) {
        if (this == outro) {
            return true;
        }
        if (!(outro instanceof MarcaDoFornecedor marca)) {
            return false;
        }
        return Objects.equals(empresaId, marca.empresaId) && Objects.equals(marcaId, marca.marcaId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(empresaId, marcaId);
    }
}
