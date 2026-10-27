package com.geitus.app.shared.numeracao;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.LongStream;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Teste de integracao do {@link Numerador} contra um PostgreSQL real
 * (Testcontainers, Flyway com as migrations de producao), com transacoes reais
 * (docs/modules/produtos.md; Review Focus 1).
 *
 * <p>Cada teste usa uma empresa nova, criada via JDBC. Requer Docker.
 */
@SpringBootTest
@Testcontainers
class NumeradorIT {

    private static final int CADASTROS_SIMULTANEOS = 20;
    private static final long ESPERA_MAXIMA_SEGUNDOS = 30;
    private static final AtomicInteger SEQUENCIA = new AtomicInteger();

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configurarDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    @Autowired
    private Numerador numerador;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Test
    void sequencia1_2_3() {
        long empresa = novaEmpresa();

        assertThat(List.of(proximoEmTransacao(empresa, TipoNumeracao.PRODUTO),
                proximoEmTransacao(empresa, TipoNumeracao.PRODUTO),
                proximoEmTransacao(empresa, TipoNumeracao.PRODUTO))).containsExactly(1L, 2L, 3L);
        assertThat(ultimoNumeroGravado(empresa, TipoNumeracao.PRODUTO)).isEqualTo(3);
    }

    /** Cada empresa e cada tipo tem a propria sequencia. */
    @Test
    void empresasIndependentes() {
        long empresaA = novaEmpresa();
        long empresaB = novaEmpresa();

        proximoEmTransacao(empresaA, TipoNumeracao.PRODUTO);
        proximoEmTransacao(empresaA, TipoNumeracao.PRODUTO);

        assertThat(proximoEmTransacao(empresaB, TipoNumeracao.PRODUTO)).isEqualTo(1);
        assertThat(proximoEmTransacao(empresaA, TipoNumeracao.CLIENTE)).isEqualTo(1);
        assertThat(proximoEmTransacao(empresaA, TipoNumeracao.PRODUTO)).isEqualTo(3);
    }

    /** Empresa migrada pela V11 continua do maior numero gravado. */
    @Test
    void continuaDoUltimoNumeroGravado() {
        long empresa = novaEmpresa();
        jdbcTemplate.update("INSERT INTO numeracoes (empresa_id, tipo, ultimo_numero) VALUES (?, 'CLIENTE', 30)",
                empresa);

        assertThat(proximoEmTransacao(empresa, TipoNumeracao.CLIENTE)).isEqualTo(31);
    }

    /**
     * Review Focus 1: 20 transacoes largadas juntas na mesma empresa (inclusive
     * a criacao da linha em {@code numeracoes}) recebem 1..20, sem repetir e
     * sem erro.
     */
    @Test
    void vinteEmParaleloSaoDistintosEConsecutivos() throws Exception {
        long empresa = novaEmpresa();
        CyclicBarrier largada = new CyclicBarrier(CADASTROS_SIMULTANEOS);
        ExecutorService executor = Executors.newFixedThreadPool(CADASTROS_SIMULTANEOS);
        try {
            List<Future<Long>> resultados = new ArrayList<>();
            for (int indice = 0; indice < CADASTROS_SIMULTANEOS; indice++) {
                resultados.add(executor.submit(proximoAoMesmoTempo(largada, empresa)));
            }
            List<Long> numeros = new ArrayList<>();
            for (Future<Long> resultado : resultados) {
                numeros.add(resultado.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS));
            }

            assertThat(numeros).containsExactlyInAnyOrderElementsOf(
                    LongStream.rangeClosed(1, CADASTROS_SIMULTANEOS).boxed().toList());
            assertThat(ultimoNumeroGravado(empresa, TipoNumeracao.PRODUTO)).isEqualTo(CADASTROS_SIMULTANEOS);
        } finally {
            executor.shutdownNow();
        }
    }

    /** O rollback desfaz o incremento: o proximo cadastro recebe o mesmo numero. */
    @Test
    void rollbackNaoConsomeNumero() {
        long empresa = novaEmpresa();
        proximoEmTransacao(empresa, TipoNumeracao.PRODUTO);

        Long numeroDesfeito = new TransactionTemplate(transactionManager).execute(status -> {
            long numero = numerador.proximo(empresa, TipoNumeracao.PRODUTO);
            status.setRollbackOnly();
            return numero;
        });

        assertThat(numeroDesfeito).isEqualTo(2);
        assertThat(proximoEmTransacao(empresa, TipoNumeracao.PRODUTO)).isEqualTo(2);
    }

    /** Fora de transacao o incremento nao poderia ser desfeito junto com o cadastro: e recusado. */
    @Test
    void exigeTransacao() {
        long empresa = novaEmpresa();

        assertThatThrownBy(() -> numerador.proximo(empresa, TipoNumeracao.PRODUTO))
                .isInstanceOf(IllegalTransactionStateException.class);
    }

    // ---------- Apoio ----------

    private Callable<Long> proximoAoMesmoTempo(CyclicBarrier largada, long empresa) {
        return () -> {
            largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
            return proximoEmTransacao(empresa, TipoNumeracao.PRODUTO);
        };
    }

    private long proximoEmTransacao(long empresa, TipoNumeracao tipo) {
        return new TransactionTemplate(transactionManager).execute(status -> numerador.proximo(empresa, tipo));
    }

    private long ultimoNumeroGravado(long empresa, TipoNumeracao tipo) {
        return jdbcTemplate.queryForObject("SELECT ultimo_numero FROM numeracoes WHERE empresa_id = ? AND tipo = ?",
                Long.class, empresa, tipo.name());
    }

    /** Empresa FISICA (sem CNPJ) com as colunas NOT NULL da V3; nome unico por teste. */
    private long novaEmpresa() {
        String sufixo = String.valueOf(SEQUENCIA.incrementAndGet());
        return jdbcTemplate.queryForObject("""
                INSERT INTO empresa (nome, representante_nome, representante_cpf, representante_telefone,
                                     representante_email, telefone, email, tipo_pessoa, endereco_cep,
                                     endereco_logradouro, endereco_numero, endereco_bairro,
                                     endereco_municipio, endereco_uf)
                VALUES (?, ?, '11144477735', '11987654321', ?, '1133224455', ?, 'FISICA', '01001000',
                        'Praça da Sé', 'S/N', 'Sé', 'São Paulo', 'SP')
                RETURNING id
                """, Long.class, "Empresa Numerador " + sufixo, "Representante " + sufixo,
                "rep" + sufixo + "@numerador.test", "contato" + sufixo + "@numerador.test");
    }
}
