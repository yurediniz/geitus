package com.geitus.app.cashier.sessao;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.geitus.app.cashier.CaixaConflitoException;
import com.geitus.app.cashier.CenarioDeCaixa.EmpresaDeCaixa;
import com.geitus.app.cashier.IntegracaoDoCaixa;
import com.geitus.app.cashier.sessao.dto.AbrirCaixaRequest;
import com.geitus.app.cashier.sessao.dto.MovimentoDeCaixaRequest;

/**
 * Concorrencia do caixa (docs/modules/caixa.md, 3.8), com pedidos simultaneos
 * de verdade ({@link CyclicBarrier}, como no {@code EstoqueServiceIT}) e
 * varias rodadas para dar chance real a corrida:
 * <ul>
 *   <li>duas sangrias que juntas passam do esperado: a trava da sessao poe as
 *       duas em fila, uma grava e a outra recebe 409 com o que sobrou;</li>
 *   <li>duas aberturas no mesmo ponto: uma abre e a outra recebe o 409 de
 *       ponto ocupado, com o nome de quem ganhou;</li>
 *   <li>o mesmo usuario abrindo dois pontos ao mesmo tempo: nao ha trava em
 *       comum, a corrida chega ao indice parcial
 *       {@code uq_sessao_caixa_usuario_aberta} e vira o 409 certo, nunca 500.</li>
 * </ul>
 */
class ConcorrenciaDoCaixaIT extends IntegracaoDoCaixa {

    private static final int RODADAS = 5;
    private static final long ESPERA_MAXIMA_SEGUNDOS = 30;
    private static final String CRIADO = "criado";

    @Autowired
    private SessoesDeCaixaService sessoesService;

    private ExecutorService executor;

    @BeforeEach
    void iniciarExecutor() {
        executor = Executors.newFixedThreadPool(2);
    }

    @AfterEach
    void pararExecutor() {
        executor.shutdownNow();
    }

    @Test
    void duasSangriasQueJuntasPassamUmaRecebe409() throws Exception {
        for (int rodada = 1; rodada <= RODADAS; rodada++) {
            EmpresaDeCaixa empresa = cenario.novaEmpresa();
            UUID sessao = abrirCaixa(empresa.admin(), cenario.novoPonto(empresa, "Caixa 1"), "100.00");
            CyclicBarrier largada = new CyclicBarrier(2);

            List<String> resultados = aoMesmoTempo(
                    sangria(largada, empresa.admin(), sessao, "60.00"),
                    sangria(largada, empresa.admin(), sessao, "60.00"));

            assertThat(resultados).as("rodada %d", rodada)
                    .containsExactlyInAnyOrder(CRIADO, "A sangria passa do dinheiro na gaveta (R$ 40,00).");
            assertThat(esperado(sessao)).isEqualByComparingTo("40.00");
        }
    }

    @Test
    void duasAberturasNoMesmoPontoUmaRecebe409() throws Exception {
        for (int rodada = 1; rodada <= RODADAS; rodada++) {
            EmpresaDeCaixa empresa = cenario.novaEmpresa();
            UUID caixa1 = cenario.novoPonto(empresa, "Caixa 1");
            CyclicBarrier largada = new CyclicBarrier(2);

            List<String> resultados = aoMesmoTempo(
                    abertura(largada, empresa.admin(), caixa1),
                    abertura(largada, empresa.operadora(), caixa1));

            assertThat(resultados).as("rodada %d", rodada).contains(CRIADO)
                    .anySatisfy(mensagem -> assertThat(mensagem).isIn(
                            "O Caixa 1 já está aberto por Admin Geral.",
                            "O Caixa 1 já está aberto por Ana Souza."));
            assertThat(sessoesAbertas(empresa)).isEqualTo(1);
        }
    }

    @Test
    void mesmoUsuarioEmDoisPontosAoMesmoTempoUmRecebe409() throws Exception {
        for (int rodada = 1; rodada <= RODADAS; rodada++) {
            EmpresaDeCaixa empresa = cenario.novaEmpresa();
            UUID caixa1 = cenario.novoPonto(empresa, "Caixa 1");
            UUID caixa2 = cenario.novoPonto(empresa, "Caixa 2");
            CyclicBarrier largada = new CyclicBarrier(2);

            List<String> resultados = aoMesmoTempo(
                    abertura(largada, empresa.operadora(), caixa1),
                    abertura(largada, empresa.operadora(), caixa2));

            assertThat(resultados).as("rodada %d", rodada).contains(CRIADO)
                    .anySatisfy(mensagem -> assertThat(mensagem).isIn(
                            "Você já tem um caixa aberto no Caixa 1.",
                            "Você já tem um caixa aberto no Caixa 2."));
            assertThat(sessoesAbertas(empresa)).isEqualTo(1);
        }
    }

    // ---------- Apoio ----------

    private List<String> aoMesmoTempo(Callable<String> uma, Callable<String> outra) throws Exception {
        Future<String> primeira = executor.submit(uma);
        Future<String> segunda = executor.submit(outra);
        return List.of(primeira.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS),
                segunda.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS));
    }

    /** {@code "criado"} ou a mensagem do 409. Qualquer outro erro sobe e falha o teste. */
    private Callable<String> sangria(CyclicBarrier largada, Long usuario, UUID sessao, String valor) {
        return () -> {
            largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
            try {
                sessoesService.lancarParaUsuario(usuario, sessao, new MovimentoDeCaixaRequest(
                        TipoDeMovimentoDeCaixa.SANGRIA, new BigDecimal(valor), "Cofre", UUID.randomUUID()));
                return CRIADO;
            } catch (CaixaConflitoException conflito) {
                return conflito.getMessage();
            }
        };
    }

    private Callable<String> abertura(CyclicBarrier largada, Long usuario, UUID ponto) {
        return () -> {
            largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
            try {
                sessoesService.abrirParaUsuario(usuario, new AbrirCaixaRequest(ponto, new BigDecimal("10.00"),
                        UUID.randomUUID()));
                return CRIADO;
            } catch (CaixaConflitoException conflito) {
                return conflito.getMessage();
            }
        };
    }

    private BigDecimal esperado(UUID sessao) {
        return jdbcTemplate.queryForObject("""
                SELECT COALESCE(SUM(CASE WHEN m.tipo = 'SANGRIA' THEN -m.valor ELSE m.valor END), 0)
                FROM movimentos_caixa m JOIN sessoes_caixa s ON s.id = m.sessao_caixa_id
                WHERE s.uuid = ?
                """, BigDecimal.class, sessao);
    }

    private long sessoesAbertas(EmpresaDeCaixa empresa) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM sessoes_caixa WHERE empresa_id = ? AND status = 'ABERTA'", Long.class,
                empresa.id());
    }
}
