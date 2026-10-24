package com.geitus.app.cashier.ponto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.geitus.app.cashier.CenarioDeCaixa;
import com.geitus.app.cashier.CenarioDeCaixa.EmpresaDeCaixa;
import com.geitus.app.cashier.IntegracaoDoCaixa;
import com.geitus.app.cashier.ponto.dto.PontoDeCaixaResponse;

/**
 * Pontos de caixa (docs/modules/caixa.md, 3.1 e 5.2): o "Caixa 1" automatico
 * so para empresa sem nenhum ponto, o cadastro so por ADMIN, o nome unico sem
 * diferenciar maiusculas, o limite de 50, a inativacao so sem caixa aberto, a
 * situacao e o ultimo fundo de troco na lista e o isolamento por empresa.
 */
class PontosDeCaixaIT extends IntegracaoDoCaixa {

    private static final int RODADAS_CONCORRENTES = 5;
    private static final long ESPERA_MAXIMA_SEGUNDOS = 30;

    @Autowired
    private PontosDeCaixaService pontosService;

    // ---------- "Caixa 1" automatico ----------

    @Test
    void listaGaranteCaixa1ParaEmpresaSemPonto() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();

        listar(empresa.operadora(), "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].nome").value("Caixa 1"))
                .andExpect(jsonPath("$[0].ativo").value(true))
                .andExpect(jsonPath("$[0].situacao").value(nullValue()))
                .andExpect(jsonPath("$[0].ultimoFundoTroco").value(nullValue()));

        listar(empresa.operadora(), "").andExpect(jsonPath("$", hasSize(1)));
    }

    /** Duas primeiras consultas ao mesmo tempo: a corrida cai na unicidade do nome e nao duplica. */
    @Test
    void consultasConcorrentesGarantemUmSoCaixa1() throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            for (int rodada = 1; rodada <= RODADAS_CONCORRENTES; rodada++) {
                EmpresaDeCaixa empresa = cenario.novaEmpresa();
                CyclicBarrier largada = new CyclicBarrier(2);

                Future<List<PontoDeCaixaResponse>> uma = executor.submit(listarAoMesmoTempo(largada, empresa.admin()));
                Future<List<PontoDeCaixaResponse>> outra = executor.submit(listarAoMesmoTempo(largada,
                        empresa.operadora()));

                assertThat(uma.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS)).hasSize(1);
                assertThat(outra.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS)).hasSize(1);
                assertThat(cenario.contarPontos(empresa)).as("rodada %d", rodada).isEqualTo(1);
            }
        } finally {
            executor.shutdownNow();
        }
    }

    private Callable<List<PontoDeCaixaResponse>> listarAoMesmoTempo(CyclicBarrier largada, Long usuario) {
        return () -> {
            largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
            return pontosService.listarParaUsuario(usuario, null);
        };
    }

    @Test
    void naoRecriaCaixa1QuandoTodosInativos() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();
        UUID balcao = cenario.novoPonto(empresa, "Balcão");
        cenario.inativarPonto(balcao);

        listar(empresa.admin(), "")
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].nome").value("Balcão"))
                .andExpect(jsonPath("$[0].ativo").value(false));
        assertThat(cenario.contarPontos(empresa)).isEqualTo(1);
    }

    // ---------- Cadastro ----------

    @Test
    void criaPontoAdmin201() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();

        criar(empresa.admin(), "  Caixa 2 ")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.nome").value("Caixa 2"))
                .andExpect(jsonPath("$.ativo").value(true))
                .andExpect(jsonPath("$.situacao").value(nullValue()));
    }

    @Test
    void operadorNaoCria403() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();
        UUID ponto = cenario.novoPonto(empresa, "Caixa 1");

        criar(empresa.operadora(), "Caixa 2").andExpect(status().isForbidden());
        renomear(empresa.operadora(), ponto, "Outro").andExpect(status().isForbidden());
        acao(empresa.operadora(), ponto, "inativar").andExpect(status().isForbidden());
    }

    @Test
    void nomeRepetidoComOutraCaixa409() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();
        cenario.novoPonto(empresa, "Caixa 1");

        criar(empresa.admin(), "CAIXA 1")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.campos[0].campo").value("nome"));
    }

    @Test
    void nomeVazioOuMaisDe40Caracteres400() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();

        criar(empresa.admin(), "").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("nome"));
        criar(empresa.admin(), "   ").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("nome"));
        criar(empresa.admin(), "x".repeat(41)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("nome"));
        criar(empresa.admin(), "  " + "y".repeat(40) + "  ").andExpect(status().isCreated());
    }

    @Test
    void limiteDe50Pontos409() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();
        for (int numero = 1; numero <= 50; numero++) {
            cenario.novoPonto(empresa, "Caixa " + numero);
        }

        criar(empresa.admin(), "Caixa 51").andExpect(status().isConflict());
        assertThat(cenario.contarPontos(empresa)).isEqualTo(50);
    }

    @Test
    void renomeia200() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();
        UUID ponto = cenario.novoPonto(empresa, "Caixa 1");
        cenario.novoPonto(empresa, "Caixa 2");

        renomear(empresa.admin(), ponto, " Balcão ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nome").value("Balcão"));
        renomear(empresa.admin(), ponto, "BALCÃO").andExpect(status().isOk());
        renomear(empresa.admin(), ponto, "caixa 2").andExpect(status().isConflict())
                .andExpect(jsonPath("$.campos[0].campo").value("nome"));
    }

    // ---------- Inativar e reativar ----------

    @Test
    void inativarComSessaoAberta409() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();
        UUID ponto = cenario.novoPonto(empresa, "Caixa 1");
        cenario.sessaoAbertaPorJdbc(empresa, ponto, empresa.operadora(), "100.00", OffsetDateTime.now());

        acao(empresa.admin(), ponto, "inativar")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Feche o caixa deste ponto antes de inativá-lo."));
    }

    @Test
    void inativaEReativa200() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();
        UUID ponto = cenario.novoPonto(empresa, "Caixa 1");
        UUID sessao = cenario.sessaoAbertaPorJdbc(empresa, ponto, empresa.operadora(), "100.00",
                OffsetDateTime.now());
        cenario.fecharPorJdbc(sessao, empresa.operadora());

        acao(empresa.admin(), ponto, "inativar").andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(false));
        acao(empresa.admin(), ponto, "reativar").andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(true));
    }

    // ---------- Isolamento e filtros ----------

    @Test
    void pontoDeOutraEmpresa404() throws Exception {
        EmpresaDeCaixa empresaA = cenario.novaEmpresa();
        EmpresaDeCaixa empresaB = cenario.novaEmpresa();
        UUID daA = cenario.novoPonto(empresaA, "Caixa 1");

        renomear(empresaB.admin(), daA, "Meu").andExpect(status().isNotFound());
        acao(empresaB.admin(), daA, "inativar").andExpect(status().isNotFound());
        acao(empresaB.admin(), UUID.randomUUID(), "reativar").andExpect(status().isNotFound());
        listar(empresaB.admin(), "").andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(org.hamcrest.Matchers.not(daA.toString())));
    }

    @Test
    void filtroAtivo() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();
        cenario.novoPonto(empresa, "Caixa 1");
        cenario.inativarPonto(cenario.novoPonto(empresa, "Caixa 2"));

        listar(empresa.admin(), "?ativo=true").andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].nome").value("Caixa 1"));
        listar(empresa.admin(), "?ativo=false").andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].nome").value("Caixa 2"));
        listar(empresa.admin(), "").andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    void listaTrazSituacaoEUltimoFundoTroco() throws Exception {
        EmpresaDeCaixa empresa = cenario.novaEmpresa();
        UUID caixa1 = cenario.novoPonto(empresa, "Caixa 1");
        UUID caixa2 = cenario.novoPonto(empresa, "Caixa 2");
        UUID anterior = cenario.sessaoAbertaPorJdbc(empresa, caixa1, empresa.admin(), "80.00",
                OffsetDateTime.now().minusDays(1));
        cenario.fecharPorJdbc(anterior, empresa.admin());
        UUID aberta = cenario.sessaoAbertaPorJdbc(empresa, caixa1, empresa.operadora(), "150.00",
                OffsetDateTime.parse("2026-10-24T11:02:00Z"));

        listar(empresa.operadora(), "")
                .andExpect(jsonPath("$[0].nome").value("Caixa 1"))
                .andExpect(jsonPath("$[0].ultimoFundoTroco").value(150.00))
                .andExpect(jsonPath("$[0].situacao.status").value("ABERTA"))
                .andExpect(jsonPath("$[0].situacao.sessaoId").value(aberta.toString()))
                .andExpect(jsonPath("$[0].situacao.abertaPorNome").value(CenarioDeCaixa.NOME_DA_OPERADORA))
                .andExpect(jsonPath("$[0].situacao.abertaEm").value(endsWith("08:02:00-03:00")))
                .andExpect(jsonPath("$[1].id").value(caixa2.toString()))
                .andExpect(jsonPath("$[1].situacao").value(nullValue()))
                .andExpect(jsonPath("$[1].ultimoFundoTroco").value(nullValue()));
    }

    // ---------- Apoio ----------

    private ResultActions listar(Long usuario, String filtro) throws Exception {
        return mockMvc.perform(get("/api/caixa/pontos" + filtro).header("Authorization", cenario.token(usuario)));
    }

    private ResultActions criar(Long usuario, String nome) throws Exception {
        return mockMvc.perform(post("/api/caixa/pontos").header("Authorization", cenario.token(usuario))
                .contentType(MediaType.APPLICATION_JSON).content(corpoComNome(nome)));
    }

    private ResultActions renomear(Long usuario, UUID ponto, String nome) throws Exception {
        return mockMvc.perform(patch("/api/caixa/pontos/" + ponto).header("Authorization", cenario.token(usuario))
                .contentType(MediaType.APPLICATION_JSON).content(corpoComNome(nome)));
    }

    private ResultActions acao(Long usuario, UUID ponto, String acao) throws Exception {
        return mockMvc.perform(patch("/api/caixa/pontos/" + ponto + "/" + acao)
                .header("Authorization", cenario.token(usuario)));
    }

    private static String corpoComNome(String nome) {
        return "{\"nome\":\"" + nome + "\"}";
    }
}
