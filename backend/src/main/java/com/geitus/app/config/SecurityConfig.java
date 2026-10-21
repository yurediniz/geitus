package com.geitus.app.config;

import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.geitus.app.iam.JwtAuthenticationFilter;

/**
 * Configuracao de seguranca do Geitus.
 *
 * <p>API stateless com autenticacao via JWT (Bearer). Rotas publicas: health
 * checks, {@code POST /api/auth/login} e a documentacao (Swagger UI / api-docs,
 * liberada apenas para desenvolvimento nesta fase). Todo o restante exige token
 * valido. Respostas de erro seguem o formato {@link com.geitus.app.shared.error.ApiError}
 * (401 sem token/token invalido, 403 sem permissao), sem vazar detalhes internos.
 */
@Configuration
public class SecurityConfig {

    /**
     * Origens permitidas pelo CORS. O valor vem exclusivamente da propriedade
     * {@code geitus.cors.allowed-origins}, definida no {@code application.yml}
     * (fonte unica), que por sua vez usa a variavel de ambiente
     * {@code GEITUS_CORS_ALLOWED_ORIGINS} e, na ausencia dela, o frontend local
     * do Vite como padrao. Aceita multiplas origens separadas por virgula.
     */
    @Value("${geitus.cors.allowed-origins}")
    private String allowedOrigins;

    /** Caminhos do Swagger/OpenAPI liberados apenas em desenvolvimento. */
    private static final String[] CAMINHOS_SWAGGER = {
            "/swagger-ui.html",
            "/swagger-ui/**",
            "/v3/api-docs",
            "/v3/api-docs/**",
            "/v3/api-docs.yaml"
    };

    /** Cadastros auxiliares do catalogo: unidades de medida e categorias (DEC-031). */
    private static final String[] CAMINHOS_CADASTROS_DO_CATALOGO = {
            "/api/unidades",
            "/api/unidades/**",
            "/api/categorias",
            "/api/categorias/**"
    };

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final RestAuthenticationEntryPoint authenticationEntryPoint;
    private final RestAccessDeniedHandler accessDeniedHandler;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
            RestAuthenticationEntryPoint authenticationEntryPoint,
            RestAccessDeniedHandler accessDeniedHandler) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.authenticationEntryPoint = authenticationEntryPoint;
        this.accessDeniedHandler = accessDeniedHandler;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                // API stateless: CSRF nao se aplica (nao ha sessao baseada em cookie de formulario)
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Preflight do CORS liberado
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        // Health checks liberados
                        .requestMatchers("/api/health").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        // Login liberado (apenas POST)
                        .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                        // Documentacao (Swagger UI / api-docs) liberada apenas nesta fase de desenvolvimento
                        .requestMatchers(CAMINHOS_SWAGGER).permitAll()
                        // Troca da propria senha: qualquer usuario autenticado (inclusive OPERADOR).
                        // Precede a regra de gestao abaixo para nao cair na exigencia de ADMIN.
                        .requestMatchers(HttpMethod.PATCH, "/api/usuarios/me/senha").authenticated()
                        // Gestao de usuarios (RBAC basico): exige perfil ADMIN.
                        .requestMatchers("/api/usuarios/**").hasRole("ADMIN")
                        // Edicao do cadastro da empresa: exige ADMIN. A leitura (GET)
                        // segue liberada a qualquer autenticado pela regra final.
                        .requestMatchers(HttpMethod.PATCH, "/api/empresas/minha").hasRole("ADMIN")
                        // Produtos (RBAC basico): escrita exige perfil ADMIN; leitura
                        // liberada a qualquer autenticado. Os matchers por metodo mais
                        // especificos (POST/PATCH) precedem o GET para nao serem
                        // ofuscados. PATCH /** cobre /{id}, /{id}/inativar e /{id}/reativar.
                        .requestMatchers(HttpMethod.POST, "/api/produtos", "/api/produtos/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/produtos/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/produtos", "/api/produtos/**").authenticated()
                        // Clientes (DEC-029): inativar/reativar exige ADMIN; consultar,
                        // cadastrar e editar ficam com qualquer autenticado (o OPERADOR
                        // cadastra no balcao/PDV). A regra de ADMIN precede a geral e
                        // vale para qualquer metodo HTTP nessas rotas.
                        .requestMatchers("/api/clientes/*/inativar", "/api/clientes/*/reativar").hasRole("ADMIN")
                        .requestMatchers("/api/clientes", "/api/clientes/**").authenticated()
                        // Unidades de medida e categorias (DEC-031): leitura (GET) liberada a
                        // qualquer autenticado (o formulario de produto e o PDV as consultam);
                        // qualquer outro metodo exige ADMIN. O matcher de ADMIN e SEM metodo,
                        // como em Clientes: cobre POST/PATCH/PUT/DELETE e /{id}/inativar|reativar.
                        .requestMatchers(HttpMethod.GET, CAMINHOS_CADASTROS_DO_CATALOGO).authenticated()
                        .requestMatchers(CAMINHOS_CADASTROS_DO_CATALOGO).hasRole("ADMIN")
                        // Todo o restante exige autenticacao (JWT valido)
                        .anyRequest().authenticated())
                // Respostas de erro padronizadas (sem vazar detalhes internos)
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                // Autenticacao por JWT antes do filtro padrao de usuario/senha
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * Codificador de senha: BCrypt. Usado para gerar e verificar os hashes.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(parseOrigins(allowedOrigins));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
        configuration.setAllowCredentials(false);

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
