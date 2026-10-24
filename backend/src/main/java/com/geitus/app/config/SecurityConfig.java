package com.geitus.app.config;

import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;
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
 * checks, {@code POST /api/auth/login}, a leitura das imagens dos produtos
 * ({@code GET /api/imagens/**}, autorizada pela assinatura da URL) e a
 * documentacao (Swagger UI / api-docs), esta apenas quando o springdoc esta
 * ligado, o que so acontece no perfil {@code dev} (DEC-012, DT-010). Todo o
 * restante exige token valido. Respostas de erro seguem o formato {@link com.geitus.app.shared.error.ApiError}
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

    /**
     * Documentacao da API ligada? Desligada por padrao no {@code application.yml};
     * so o {@code application-dev.yml} a liga. Sem a propriedade, fica fechada.
     */
    @Value("${springdoc.api-docs.enabled:false}")
    private boolean documentacaoDaApiLigada;

    /** Caminhos do Swagger/OpenAPI, publicos apenas com a documentacao ligada (perfil dev). */
    private static final String[] CAMINHOS_SWAGGER = {
            "/swagger-ui.html",
            "/swagger-ui/**",
            "/v3/api-docs",
            "/v3/api-docs/**",
            "/v3/api-docs.yaml"
    };

    /** Cadastros auxiliares do catalogo: unidades de medida, categorias (DEC-031) e marcas (DEC-039). */
    private static final String[] CAMINHOS_CADASTROS_DO_CATALOGO = {
            "/api/unidades",
            "/api/unidades/**",
            "/api/categorias",
            "/api/categorias/**",
            "/api/marcas",
            "/api/marcas/**"
    };

    /** Fornecedores (DEC-039): leitura para qualquer autenticado, qualquer escrita so ADMIN. */
    private static final String[] CAMINHOS_FORNECEDORES = {
            "/api/fornecedores",
            "/api/fornecedores/**"
    };

    /** Leitura publica das imagens dos produtos por URL assinada (DEC-040). */
    private static final String CAMINHO_IMAGENS = "/api/imagens/**";

    /** Caixa (DEC-041): pontos, sessoes, movimentos e fechamento. */
    private static final String[] CAMINHOS_CAIXA = {
            "/api/caixa",
            "/api/caixa/**"
    };

    /** Pontos de caixa (DEC-041): leitura para qualquer autenticado, qualquer escrita so ADMIN. */
    private static final String[] CAMINHOS_PONTOS_DE_CAIXA = {
            "/api/caixa/pontos",
            "/api/caixa/pontos/**"
    };

    /** Configuracao do caixa (DEC-041). */
    private static final String CAMINHO_CONFIGURACAO_DO_CAIXA = "/api/configuracoes/caixa";

    /** PDV (DEC-042): itens, calculo, vendas e cancelamento, para qualquer autenticado. */
    private static final String[] CAMINHOS_PDV = {
            "/api/pdv",
            "/api/pdv/**"
    };

    /** Configuracao do PDV (DEC-042). */
    private static final String CAMINHO_CONFIGURACAO_DO_PDV = "/api/configuracoes/pdv";

    /** Configuracao e teste da etiqueta de balanca (DEC-036). */
    private static final String CAMINHO_ETIQUETA_BALANCA = "/api/etiqueta-balanca";

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
                // Registrada antes das demais regras (a ordem vale): desligada, os caminhos da
                // documentacao caem na regra final e exigem token.
                .authorizeHttpRequests(this::liberarDocumentacaoSeLigada)
                .authorizeHttpRequests(auth -> auth
                        // Preflight do CORS liberado
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        // Health checks liberados
                        .requestMatchers("/api/health").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        // Login liberado (apenas POST)
                        .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                        // Imagem do produto por URL assinada (DEC-040): sem JWT, porque a tag <img> nao o
                        // envia; quem autoriza e a assinatura, conferida no controller. So GET: qualquer
                        // outro metodo sob o caminho e negado (401 sem token, 403 com token).
                        .requestMatchers(HttpMethod.GET, CAMINHO_IMAGENS).permitAll()
                        .requestMatchers(CAMINHO_IMAGENS).denyAll()
                        // Troca da propria senha: qualquer usuario autenticado (inclusive OPERADOR).
                        // Precede a regra de gestao abaixo para nao cair na exigencia de ADMIN.
                        .requestMatchers(HttpMethod.PATCH, "/api/usuarios/me/senha").authenticated()
                        // Gestao de usuarios (RBAC basico): exige perfil ADMIN.
                        .requestMatchers("/api/usuarios/**").hasRole("ADMIN")
                        // Edicao do cadastro da empresa: exige ADMIN. A leitura (GET)
                        // segue liberada a qualquer autenticado pela regra final.
                        .requestMatchers(HttpMethod.PATCH, "/api/empresas/minha").hasRole("ADMIN")
                        // Produtos (RBAC basico, DEC-025): escrita, exclusao e sugestao de
                        // SKU exigem perfil ADMIN; leitura liberada a qualquer
                        // autenticado. Os matchers
                        // de ADMIN precedem o GET geral para nao serem ofuscados — em
                        // especial GET /sku/sugestao, que o GET /** cobriria. PATCH /**
                        // cobre /{id}, /{id}/inativar e /{id}/reativar.
                        .requestMatchers(HttpMethod.GET, "/api/produtos/sku/sugestao").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/produtos", "/api/produtos/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.PATCH, "/api/produtos/**").hasRole("ADMIN")
                        // Fase F (DEC-040): PUT /{id}/imagem envia ou troca a imagem; DELETE a remove.
                        .requestMatchers(HttpMethod.PUT, "/api/produtos/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/produtos/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/produtos", "/api/produtos/**").authenticated()
                        // Clientes (DEC-029): inativar/reativar exige ADMIN; consultar,
                        // cadastrar e editar ficam com qualquer autenticado (o OPERADOR
                        // cadastra no balcao/PDV). A regra de ADMIN precede a geral e
                        // vale para qualquer metodo HTTP nessas rotas.
                        .requestMatchers("/api/clientes/*/inativar", "/api/clientes/*/reativar").hasRole("ADMIN")
                        .requestMatchers("/api/clientes", "/api/clientes/**").authenticated()
                        // Unidades de medida, categorias (DEC-031) e marcas (DEC-039): leitura (GET) liberada a
                        // qualquer autenticado (o formulario de produto e o PDV as consultam);
                        // qualquer outro metodo exige ADMIN. O matcher de ADMIN e SEM metodo,
                        // como em Clientes: cobre POST/PATCH/PUT/DELETE e /{id}/inativar|reativar.
                        .requestMatchers(HttpMethod.GET, CAMINHOS_CADASTROS_DO_CATALOGO).authenticated()
                        .requestMatchers(CAMINHOS_CADASTROS_DO_CATALOGO).hasRole("ADMIN")
                        // Fornecedores (DEC-039): leitura (GET) para qualquer autenticado; qualquer
                        // outro metodo (cadastro, edicao, inativar/reativar, excluir e ligar ou
                        // desligar produtos) exige ADMIN. Matcher de ADMIN sem metodo, como acima.
                        .requestMatchers(HttpMethod.GET, CAMINHOS_FORNECEDORES).authenticated()
                        .requestMatchers(CAMINHOS_FORNECEDORES).hasRole("ADMIN")
                        // Etiqueta de balanca (DEC-036): ler a configuracao (GET) e testar uma
                        // etiqueta (POST /teste, nao grava nada) liberados a qualquer autenticado;
                        // salvar (PUT) e qualquer outro metodo/rota sob o caminho exigem ADMIN.
                        // As regras especificas precedem a geral de ADMIN.
                        .requestMatchers(HttpMethod.GET, CAMINHO_ETIQUETA_BALANCA).authenticated()
                        .requestMatchers(HttpMethod.POST, CAMINHO_ETIQUETA_BALANCA + "/teste").authenticated()
                        .requestMatchers(CAMINHO_ETIQUETA_BALANCA, CAMINHO_ETIQUETA_BALANCA + "/**").hasRole("ADMIN")
                        // Caixa (DEC-041): pontos com leitura (GET) para qualquer autenticado e qualquer
                        // outro metodo (cadastrar, renomear, inativar, reativar) so ADMIN, com o matcher
                        // SEM metodo, como em Fornecedores; o resto do caixa (abrir, lancar, contar, fechar
                        // e historico) fica com qualquer autenticado, e a regra "dono ou ADMIN" da sessao
                        // fica no service. Os services tambem conferem o perfil do banco nas escritas.
                        .requestMatchers(HttpMethod.GET, CAMINHOS_PONTOS_DE_CAIXA).authenticated()
                        .requestMatchers(CAMINHOS_PONTOS_DE_CAIXA).hasRole("ADMIN")
                        .requestMatchers(CAMINHOS_CAIXA).authenticated()
                        // Configuracao do caixa: leitura para qualquer autenticado (a tela do caixa precisa
                        // do modo); qualquer outro metodo exige ADMIN.
                        .requestMatchers(HttpMethod.GET, CAMINHO_CONFIGURACAO_DO_CAIXA).authenticated()
                        .requestMatchers(CAMINHO_CONFIGURACAO_DO_CAIXA).hasRole("ADMIN")
                        // PDV (DEC-042): toda a venda (itens, calculo, finalizar, consultar e cancelar) fica
                        // com qualquer autenticado; a regra "dono da sessao ou ADMIN" e o limite de desconto
                        // pelo perfil do banco ficam nos services.
                        .requestMatchers(CAMINHOS_PDV).authenticated()
                        // Configuracao do PDV: leitura para qualquer autenticado (a tela do PDV precisa das
                        // regras); qualquer outro metodo exige ADMIN, e o service confere o perfil do banco.
                        .requestMatchers(HttpMethod.GET, CAMINHO_CONFIGURACAO_DO_PDV).authenticated()
                        .requestMatchers(CAMINHO_CONFIGURACAO_DO_PDV).hasRole("ADMIN")
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

    /** Documentacao (Swagger UI / api-docs) publica so com o springdoc ligado, isto e, no perfil dev. */
    private void liberarDocumentacaoSeLigada(
            AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry auth) {
        if (documentacaoDaApiLigada) {
            auth.requestMatchers(CAMINHOS_SWAGGER).permitAll();
        }
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
