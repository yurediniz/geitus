package com.geitus.app.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;

/**
 * Configuracao do OpenAPI/Swagger (springdoc) para o Geitus.
 *
 * <p>Declara o esquema de seguranca {@code bearer-jwt} para que o Swagger UI
 * permita informar o token nas rotas protegidas. A documentacao e voltada ao
 * desenvolvimento; a exposicao em producao depende de decisao futura (DEC-012).
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI geitusOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Geitus API")
                        .description("API do Geitus. Autenticacao via JWT (Bearer).")
                        .version("v0"))
                .components(new Components()
                        .addSecuritySchemes("bearer-jwt", new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")));
    }
}
