package com.geitus.app.company.dto;

import com.geitus.app.company.TipoPessoa;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Implementacao da anotacao {@link PessoaCoerente}. A regra pura vive em
 * {@link #coerente(String, String, String)}, reutilizada pela revalidacao no
 * {@code EmpresaService} e exercitada por testes unitarios.
 */
public class PessoaCoerenteValidator implements ConstraintValidator<PessoaCoerente, EmpresaAtualizarRequest> {

    @Override
    public boolean isValid(EmpresaAtualizarRequest request, ConstraintValidatorContext context) {
        if (request == null) {
            return true;
        }
        return coerente(request.tipoPessoa(), request.cnpj(), request.razaoSocial());
    }

    /**
     * Regra de coerencia PJ/PF. Quando {@code tipoPessoa} nao pertence a
     * allow-list, retorna {@code true} (defere o erro a outras validacoes).
     *
     * <ul>
     *   <li>JURIDICA: exige {@code cnpj} e {@code razaoSocial} preenchidos;</li>
     *   <li>FISICA: exige {@code cnpj} ausente.</li>
     * </ul>
     */
    public static boolean coerente(String tipoPessoa, String cnpj, String razaoSocial) {
        TipoPessoa tipo;
        try {
            tipo = TipoPessoa.fromString(tipoPessoa);
        } catch (IllegalArgumentException ex) {
            return true;
        }
        boolean temCnpj = cnpj != null && !cnpj.isBlank();
        boolean temRazao = razaoSocial != null && !razaoSocial.isBlank();
        return switch (tipo) {
            case JURIDICA -> temCnpj && temRazao;
            case FISICA -> !temCnpj;
        };
    }
}
