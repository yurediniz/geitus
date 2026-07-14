package com.geitus.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Ponto de entrada da aplicacao backend do Geitus.
 *
 * <p>Esta e a base inicial do projeto: apenas sobe o contexto do Spring Boot,
 * a seguranca minima e o endpoint de health check. Os modulos de negocio
 * (produtos, clientes, PDV, caixa, financeiro, etc.) serao adicionados nas
 * proximas etapas, conforme o CLAUDE.md.
 */
@SpringBootApplication
public class GeitusApplication {

    public static void main(String[] args) {
        SpringApplication.run(GeitusApplication.class, args);
    }
}
