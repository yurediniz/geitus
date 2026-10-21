package com.geitus.app.shared.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Implementacao da anotacao {@link Telefone}. Delega a
 * {@link Telefones#valido(String)}. Nulo/vazio e tratado como valido (a presenca
 * e responsabilidade de {@code @NotBlank}).
 */
public class TelefoneValidator implements ConstraintValidator<Telefone, String> {

    @Override
    public boolean isValid(String valor, ConstraintValidatorContext context) {
        if (valor == null || valor.isBlank()) {
            return true;
        }
        return Telefones.valido(valor);
    }
}
