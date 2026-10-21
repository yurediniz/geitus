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
 * Valida que o campo e um telefone BR (10 ou 11 digitos, DDD 11-99).
 *
 * <p>Aceita entrada com ou sem mascara. Valores nulos/em branco sao considerados
 * validos por esta anotacao (a obrigatoriedade fica a cargo de {@code @NotBlank}).
 */
@Documented
@Constraint(validatedBy = TelefoneValidator.class)
@Target({FIELD, PARAMETER})
@Retention(RUNTIME)
public @interface Telefone {

    String message() default "Telefone inválido.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
