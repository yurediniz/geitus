package com.geitus.app.customer.dto;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.TYPE;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * Valida o {@code whatsapp} de um {@link ClienteRequest} apenas quando ele e
 * relevante (docs/modules/clientes.md, secao 4):
 *
 * <ul>
 *   <li>{@code telefoneEWhatsapp = false}: o {@code whatsapp}, se informado,
 *       precisa ser um telefone BR valido;</li>
 *   <li>{@code telefoneEWhatsapp} ausente ou {@code true}: o {@code whatsapp}
 *       recebido e descartado pelo service, entao nao e validado.</li>
 * </ul>
 *
 * <p>Anotacao de classe (avalia o objeto inteiro), mas o erro e reportado no
 * no {@code whatsapp}, para a resposta 400 apontar o campo.
 */
@Documented
@Constraint(validatedBy = WhatsappCoerenteValidator.class)
@Target(TYPE)
@Retention(RUNTIME)
public @interface WhatsappCoerente {

    String message() default "WhatsApp inválido.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
