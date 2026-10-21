package com.geitus.app.shared.validation;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.ElementType.PARAMETER;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * Valida que o campo e um CPF com digitos verificadores validos.
 *
 * <p>Aceita entrada com ou sem mascara. Valores nulos/em branco sao considerados
 * validos por esta anotacao (a obrigatoriedade fica a cargo de {@code @NotBlank}),
 * permitindo compor as duas regras sem mensagens duplicadas.
 */
@Documented
@Constraint(validatedBy = CpfValidator.class)
@Target({FIELD, PARAMETER})
@Retention(RUNTIME)
public @interface Cpf {

    String message() default "CPF inválido.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
