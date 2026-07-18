package com.geitus.app.company.validation;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.ElementType.PARAMETER;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * Valida que o campo e um CNPJ com digitos verificadores validos.
 *
 * <p>Aceita entrada com ou sem mascara. Valores nulos/em branco sao considerados
 * validos por esta anotacao — o CNPJ e opcional na estrutura (so obrigatorio
 * quando JURIDICA, regra garantida por {@code @PessoaCoerente}).
 */
@Documented
@Constraint(validatedBy = CnpjValidator.class)
@Target({FIELD, PARAMETER})
@Retention(RUNTIME)
public @interface Cnpj {

    String message() default "CNPJ inválido.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
