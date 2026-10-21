package com.geitus.app.customer.dto;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Testa a regra pura do {@code @WhatsappCoerente}: o WhatsApp so e validado
 * quando o cliente declara um WhatsApp proprio (docs/modules/clientes.md, secao 4).
 */
class WhatsappCoerenteValidatorTest {

    private static final String WHATSAPP_VALIDO = "(11) 91234-5678";
    private static final String WHATSAPP_INVALIDO = "123";

    @Test
    void whatsappProprioPrecisaSerTelefoneValido() {
        assertThat(WhatsappCoerenteValidator.coerente(false, WHATSAPP_VALIDO)).isTrue();
        assertThat(WhatsappCoerenteValidator.coerente(false, WHATSAPP_INVALIDO)).isFalse();
    }

    @Test
    void whatsappProprioEmBrancoEValido() {
        assertThat(WhatsappCoerenteValidator.coerente(false, null)).isTrue();
        assertThat(WhatsappCoerenteValidator.coerente(false, "   ")).isTrue();
    }

    @Test
    void whatsappEDescartadoSemValidarQuandoTelefoneEWhatsapp() {
        assertThat(WhatsappCoerenteValidator.coerente(true, WHATSAPP_INVALIDO)).isTrue();
        assertThat(WhatsappCoerenteValidator.coerente(null, WHATSAPP_INVALIDO)).isTrue();
    }
}
