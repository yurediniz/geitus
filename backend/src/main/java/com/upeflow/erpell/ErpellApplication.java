package com.upeflow.erpell;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Ponto de entrada da aplicacao backend do ERPell.
 *
 * <p>Esta e a base inicial do projeto: apenas sobe o contexto do Spring Boot,
 * a seguranca minima e o endpoint de health check. Os modulos de negocio
 * (produtos, clientes, PDV, caixa, financeiro, etc.) serao adicionados nas
 * proximas etapas, conforme o CLAUDE.md.
 */
@SpringBootApplication
public class ErpellApplication {

    public static void main(String[] args) {
        SpringApplication.run(ErpellApplication.class, args);
    }
}
