package com.geitus.app.company.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Implementacao da anotacao {@link Cpf}. Delega a checagem dos digitos
 * verificadores a {@link Documentos#cpfValido(String)}. Nulo/vazio e tratado
 * como valido (a presenca e responsabilidade de {@code @NotBlank}).
 */
public class CpfValidator implements ConstraintValidator<Cpf, String> {

    @Override
    public boolean isValid(String valor, ConstraintValidatorContext context) {
        if (valor == null || valor.isBlank()) {
            return true;
        }
        return Documentos.cpfValido(valor);
    }
}
