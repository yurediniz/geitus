package com.geitus.app.cashier;

import java.util.Objects;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * Identifica qual constraint (ou indice unico) o banco recusou, pelo nome que
 * o Hibernate extrai do erro, e nao pelo texto da mensagem (DT-032). Usado
 * para transformar corridas que chegam a unicidade em respostas de negocio.
 */
public final class ViolacaoDeConstraint {

    private ViolacaoDeConstraint() {
        // Apenas metodos estaticos.
    }

    public static boolean violou(DataIntegrityViolationException violacao, String constraint) {
        for (Throwable causa = violacao; causa != null; causa = causa.getCause()) {
            if (causa instanceof ConstraintViolationException hibernate
                    && constraint.equalsIgnoreCase(Objects.toString(hibernate.getConstraintName(), ""))) {
                return true;
            }
        }
        return false;
    }
}
