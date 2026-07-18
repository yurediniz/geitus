package com.geitus.app.company.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Implementacao da anotacao {@link Cnpj}. Delega a checagem dos digitos
 * verificadores a {@link Documentos#cnpjValido(String)}. Nulo/vazio e tratado
 * como valido (o CNPJ so e obrigatorio quando JURIDICA, ver {@code @PessoaCoerente}).
 */
public class CnpjValidator implements ConstraintValidator<Cnpj, String> {

    @Override
    public boolean isValid(String valor, ConstraintValidatorContext context) {
        if (valor == null || valor.isBlank()) {
            return true;
        }
        return Documentos.cnpjValido(valor);
    }
}
