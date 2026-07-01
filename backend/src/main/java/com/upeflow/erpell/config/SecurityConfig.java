package com.upeflow.erpell.config;

import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Configuracao basica de seguranca do ERPell.
 *
 * <p>Nesta etapa inicial a regra e simples: liberar apenas o health check e
 * exigir autenticacao para qualquer outra rota. A autenticacao completa (JWT,
 * login e usuarios) sera implementada em uma etapa futura.
 *
 * <p>Tambem define o CORS basico para permitir que o frontend local (Vite)
 * consuma a API durante o desenvolvimento.
 */
@Configuration
public class SecurityConfig {

    /**
     * Origens permitidas pelo CORS. Configuravel por variavel de ambiente
     * ({@code ERPELL_CORS_ALLOWED_ORIGINS}); por padrao aceita o frontend local
     * do Vite. Aceita multiplas origens separadas por virgula.
     */
    @Value("${erpell.cors.allowed-origins:http://localhost:5173}")
    private String allowedOrigins;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                // API stateless: CSRF nao se aplica (nao ha sessao baseada em cookie de formulario)
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Health check liberado (inclui a requisicao de preflight do CORS)
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/api/health").permitAll()
                        // Health check padrao do Actuator tambem liberado
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        // Por enquanto, todo o restante exige autenticacao (ainda nao implementada)
                        .anyRequest().authenticated())
                // Sem login por formulario; API responde 401 para acesso nao autenticado
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(parseOrigins(allowedOrigins));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private List<String> parseOrigins(String origins) {
        return Arrays.stream(origins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
    }
}
