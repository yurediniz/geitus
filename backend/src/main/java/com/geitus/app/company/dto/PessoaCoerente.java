package com.geitus.app.company.dto;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import static java.lang.annotation.ElementType.TYPE;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * Valida a coerencia entre {@code tipoPessoa} e os campos de PJ de um
 * {@link EmpresaAtualizarRequest}:
 *
 * <ul>
 *   <li>JURIDICA exige {@code cnpj} e {@code razaoSocial} preenchidos;</li>
 *   <li>FISICA nao pode ter {@code cnpj}.</li>
 * </ul>
 *
 * <p>Anotacao de classe (avalia o objeto inteiro). Quando {@code tipoPessoa} nao
 * for um valor valido, esta validacao e omissa (retorna valido) para nao duplicar
 * o erro ja reportado por {@code @Pattern}/{@code @NotBlank}.
 */
@Documented
@Constraint(validatedBy = PessoaCoerenteValidator.class)
@Target(TYPE)
@Retention(RUNTIME)
public @interface PessoaCoerente {

    String message() default "Dados incompatíveis com o tipo de pessoa informado.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
