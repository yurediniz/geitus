package com.geitus.app.customer.dto;

import com.geitus.app.shared.validation.Telefones;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * Implementacao da anotacao {@link WhatsappCoerente}. A regra pura vive em
 * {@link #coerente(Boolean, String)} e e exercitada por testes unitarios; a
 * revalidacao equivalente fica no {@code ClienteService}.
 */
public class WhatsappCoerenteValidator implements ConstraintValidator<WhatsappCoerente, ClienteRequest> {

    private static final String CAMPO_WHATSAPP = "whatsapp";

    @Override
    public boolean isValid(ClienteRequest request, ConstraintValidatorContext context) {
        if (request == null || coerente(request.telefoneEWhatsapp(), request.whatsapp())) {
            return true;
        }
        context.disableDefaultConstraintViolation();
        context.buildConstraintViolationWithTemplate(context.getDefaultConstraintMessageTemplate())
                .addPropertyNode(CAMPO_WHATSAPP)
                .addConstraintViolation();
        return false;
    }

    /**
     * Regra de coerencia do WhatsApp: so e validado quando o cliente declara um
     * WhatsApp proprio ({@code telefoneEWhatsapp = false}) e o informa. Ausente
     * (ou {@code true}) significa "o telefone e WhatsApp" e o valor e descartado.
     */
    public static boolean coerente(Boolean telefoneEWhatsapp, String whatsapp) {
        boolean whatsappProprio = Boolean.FALSE.equals(telefoneEWhatsapp);
        if (!whatsappProprio || whatsapp == null || whatsapp.isBlank()) {
            return true;
        }
        return Telefones.valido(whatsapp);
    }
}
