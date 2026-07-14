package com.geitus.app.shared;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import com.geitus.app.iam.JwtAuthenticationFilter;
import com.geitus.app.iam.JwtService;
import com.geitus.app.config.RestAccessDeniedHandler;
import com.geitus.app.config.RestAuthenticationEntryPoint;
import com.geitus.app.config.SecurityConfig;

/**
 * Testa o endpoint de health check e a regra de seguranca que o libera.
 *
 * <p>Usa uma fatia web ({@code @WebMvcTest}) para nao depender de banco de dados,
 * permitindo que a base rode em qualquer ambiente sem um PostgreSQL ativo.
 */
@WebMvcTest(HealthController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtService.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class
})
class HealthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void healthCheckDeveResponderUp() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.aplicacao").value("Geitus"));
    }

    /**
     * Ancora para a futura autenticacao: qualquer rota que nao esteja
     * explicitamente liberada deve ser barrada pela cadeia de seguranca
     * ({@code anyRequest().authenticated()}) e responder 401.
     */
    @Test
    void rotaProtegidaDeveResponder401() throws Exception {
        mockMvc.perform(get("/api/protegido"))
                .andExpect(status().isUnauthorized());
    }
}
