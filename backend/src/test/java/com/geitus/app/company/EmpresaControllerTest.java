package com.geitus.app.company;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.geitus.app.company.dto.EmpresaDetalheResponse;
import com.geitus.app.company.dto.EmpresaDetalheResponse.EnderecoResponse;
import com.geitus.app.company.dto.EmpresaDetalheResponse.RepresentanteLegalResponse;
import com.geitus.app.config.RestAccessDeniedHandler;
import com.geitus.app.config.RestAuthenticationEntryPoint;
import com.geitus.app.config.SecurityConfig;
import com.geitus.app.iam.JwtAuthenticationFilter;
import com.geitus.app.iam.JwtService;
import com.geitus.app.iam.Usuario;
import com.geitus.app.shared.error.GlobalExceptionHandler;

/**
 * Testa o contrato HTTP do cadastro da empresa e o RBAC: leitura liberada a
 * qualquer autenticado; edicao restrita a ADMIN (OPERADOR recebe 403). Usa uma
 * fatia web sem banco.
 *
 * <p>{@link JwtService} e bean real (gera tokens de teste); {@link EmpresaService}
 * e mockado.
 */
@WebMvcTest(EmpresaController.class)
@Import({
        SecurityConfig.class,
        JwtAuthenticationFilter.class,
        JwtService.class,
        RestAuthenticationEntryPoint.class,
        RestAccessDeniedHandler.class,
        GlobalExceptionHandler.class
})
class EmpresaControllerTest {

    private static final String BODY_VALIDO = """
            {
              "nome": "Mercado do Zé",
              "telefone": "(11) 3322-4455",
              "email": "contato@mercado.com",
              "tipoPessoa": "JURIDICA",
              "cnpj": "11.222.333/0001-81",
              "razaoSocial": "Mercado do Zé LTDA",
              "inscricaoEstadual": "1234567890",
              "representanteLegal": {
                "nome": "Maria da Silva",
                "cpf": "111.444.777-35",
                "telefone": "(11) 98765-4321",
                "email": "maria@empresa.com"
              },
              "endereco": {
                "cep": "01001-000",
                "logradouro": "Praça da Sé",
                "numero": "100",
                "bairro": "Sé",
                "municipio": "São Paulo",
                "uf": "SP"
              }
            }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockBean
    private EmpresaService empresaService;

    private String token(Long idUsuario, String perfil) {
        Usuario usuario = org.mockito.Mockito.mock(Usuario.class);
        when(usuario.getId()).thenReturn(idUsuario);
        when(usuario.getPerfil()).thenReturn(perfil);
        when(usuario.getEmpresaId()).thenReturn(7L);
        return jwtService.gerarToken(usuario);
    }

    private EmpresaDetalheResponse respostaFake() {
        return new EmpresaDetalheResponse(
                7L, "Mercado do Zé", "1133224455", "contato@mercado.com",
                TipoPessoa.JURIDICA, "11222333000181", "Mercado do Zé LTDA", "1234567890",
                new RepresentanteLegalResponse("Maria da Silva", "11144477735", "11987654321", "maria@empresa.com"),
                new EnderecoResponse("01001000", "Praça da Sé", "100", null, "Sé", "São Paulo", "SP"),
                true, LocalDateTime.now(), LocalDateTime.now());
    }

    // ---------- Autenticacao ----------

    @Test
    void minhaEmpresaSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(get("/api/empresas/minha"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void atualizarMinhaEmpresaSemTokenDeveRetornar401() throws Exception {
        mockMvc.perform(patch("/api/empresas/minha")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY_VALIDO))
                .andExpect(status().isUnauthorized());
    }

    // ---------- Leitura ----------

    @Test
    void minhaEmpresaComOperadorDeveRetornar200() throws Exception {
        when(empresaService.buscarEmpresaDoUsuario(2L)).thenReturn(respostaFake());

        mockMvc.perform(get("/api/empresas/minha").header("Authorization", "Bearer " + token(2L, "OPERADOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.nome").value("Mercado do Zé"))
                .andExpect(jsonPath("$.tipoPessoa").value("JURIDICA"))
                .andExpect(jsonPath("$.representanteLegal.cpf").value("11144477735"))
                .andExpect(jsonPath("$.endereco.uf").value("SP"));
    }

    // ---------- RBAC na edicao ----------

    @Test
    void atualizarMinhaEmpresaComAdminDeveRetornar200() throws Exception {
        when(empresaService.atualizarEmpresa(eq(1L), any())).thenReturn(respostaFake());

        mockMvc.perform(patch("/api/empresas/minha")
                        .header("Authorization", "Bearer " + token(1L, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY_VALIDO))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.cnpj").value("11222333000181"));

        org.mockito.Mockito.verify(empresaService).atualizarEmpresa(eq(1L), any());
    }

    @Test
    void atualizarMinhaEmpresaComOperadorDeveRetornar403() throws Exception {
        mockMvc.perform(patch("/api/empresas/minha")
                        .header("Authorization", "Bearer " + token(2L, "OPERADOR"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY_VALIDO))
                .andExpect(status().isForbidden());
    }

    // ---------- Validacao ----------

    @Test
    void atualizarMinhaEmpresaSemEnderecoDeveRetornar400() throws Exception {
        String semEndereco = """
                {
                  "nome": "Mercado do Zé",
                  "telefone": "(11) 3322-4455",
                  "email": "contato@mercado.com",
                  "tipoPessoa": "FISICA",
                  "representanteLegal": {
                    "nome": "Maria da Silva",
                    "cpf": "111.444.777-35",
                    "telefone": "(11) 98765-4321",
                    "email": "maria@empresa.com"
                  }
                }
                """;

        mockMvc.perform(patch("/api/empresas/minha")
                        .header("Authorization", "Bearer " + token(1L, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(semEndereco))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.campos").isArray());
    }

    @Test
    void atualizarMinhaEmpresaComCpfInvalidoDeveRetornar400() throws Exception {
        String cpfInvalido = BODY_VALIDO.replace("111.444.777-35", "111.444.777-00");

        mockMvc.perform(patch("/api/empresas/minha")
                        .header("Authorization", "Bearer " + token(1L, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(cpfInvalido))
                .andExpect(status().isBadRequest());
    }

    @Test
    void atualizarMinhaEmpresaJuridicaSemCnpjDeveRetornar400() throws Exception {
        String semCnpj = BODY_VALIDO.replace("\"cnpj\": \"11.222.333/0001-81\",", "");

        mockMvc.perform(patch("/api/empresas/minha")
                        .header("Authorization", "Bearer " + token(1L, "ADMIN"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(semCnpj))
                .andExpect(status().isBadRequest());
    }
}
