package com.geitus.app.config;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Relogio unico da aplicacao (DEC-033). Datas de negocio (vigencia de
 * promocao e, no futuro, caixa e PDV) sao lidas daqui, nunca de
 * {@code LocalDate.now()} sem relogio, para respeitar o fuso e permitir
 * relogio fixo nos testes.
 *
 * <p>Fuso fixo {@code America/Sao_Paulo} no MVP; fuso por empresa fica para
 * quando houver cliente fora dele (docs/modules/produtos.md).
 */
@Configuration
public class RelogioConfig {

    static final ZoneId FUSO_DO_NEGOCIO = ZoneId.of("America/Sao_Paulo");

    @Bean
    public Clock relogio() {
        return Clock.system(FUSO_DO_NEGOCIO);
    }
}
