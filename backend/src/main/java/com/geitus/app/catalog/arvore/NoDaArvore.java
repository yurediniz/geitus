package com.geitus.app.catalog.arvore;

import java.util.UUID;

/**
 * Item de um cadastro em arvore da empresa (Categorias e Marcas), visto pela
 * {@link Arvore}. {@code getPaiId() == null} indica um item na raiz.
 */
public interface NoDaArvore {

    /** PK interna (DEC-015); ja persistida quando o no entra na arvore. */
    Long getId();

    /** Id interno do pai, ou {@code null} na raiz. */
    Long getPaiId();

    String getNome();

    boolean isAtivo();

    /** Identificador publico (DEC-019). */
    UUID getUuid();
}
