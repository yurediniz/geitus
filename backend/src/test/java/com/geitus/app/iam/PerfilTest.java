package com.geitus.app.iam;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * Testa a allow-list de perfis {@link Perfil}: aceita apenas ADMIN/OPERADOR
 * (case-insensitive, canonico em maiusculas) e rejeita valores fora da lista.
 */
class PerfilTest {

    @Test
    void deveConverterAdmin() {
        assertThat(Perfil.fromString("ADMIN")).isEqualTo(Perfil.ADMIN);
    }

    @Test
    void deveConverterOperador() {
        assertThat(Perfil.fromString("OPERADOR")).isEqualTo(Perfil.OPERADOR);
    }

    @Test
    void deveAceitarValorComEspacosECaseDiferente() {
        assertThat(Perfil.fromString("  operador ")).isEqualTo(Perfil.OPERADOR);
    }

    @Test
    void deveRejeitarValorForaDaAllowList() {
        assertThatThrownBy(() -> Perfil.fromString("GERENTE"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void deveRejeitarValorNulo() {
        assertThatThrownBy(() -> Perfil.fromString(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void deveRejeitarValorEmBranco() {
        assertThatThrownBy(() -> Perfil.fromString("   "))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
