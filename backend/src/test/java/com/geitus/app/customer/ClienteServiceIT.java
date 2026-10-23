package com.geitus.app.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Teste de integracao do numero de registro dos clientes (Fase B2,
 * docs/modules/produtos-codigo-e-balanca.md, 2.1 e 2.2) com o contexto Spring
 * completo, transacoes reais e um PostgreSQL real (Testcontainers).
 *
 * <p>Sem {@code @Transactional} na classe: cada chamada abre e confirma a propria
 * transacao, como em producao. Cada teste usa uma empresa nova. Requer Docker.
 */
@SpringBootTest
@Testcontainers
class ClienteServiceIT {

    private static final String CPF_VALIDO = "11144477735";
    private static final int CADASTROS_SIMULTANEOS = 10;
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
    private ClienteService clienteService;

    @Autowired
    private EmpresaRepository empresaRepository;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Test
    void clientesRecebemNumerosEmSequenciaEAEdicaoNaoMuda() {
        Long idUsuario = novoAdmin(novaEmpresa());

        Cliente primeiro = clienteService.cadastrarParaUsuario(idUsuario, dados("Ana", null));
        Cliente segundo = clienteService.cadastrarParaUsuario(idUsuario, dados("Bruno", null));
        Cliente editado = clienteService.atualizarParaUsuario(idUsuario, segundo.getUuid(), dados("Bruno Lima", null));

        assertThat(primeiro.getNumero()).isEqualTo(1L);
        assertThat(segundo.getNumero()).isEqualTo(2L);
        assertThat(editado.getNumero()).isEqualTo(2L);
        assertThat(clienteService.buscarParaUsuario(idUsuario, segundo.getUuid()).getNumero()).isEqualTo(2L);
    }

    /** Review Focus 1: o CPF repetido falha e nao "queima" numero. */
    @Test
    void cadastroRecusadoAntesDeReservarNaoConsomeNumero() {
        Long idUsuario = novoAdmin(novaEmpresa());
        clienteService.cadastrarParaUsuario(idUsuario, dados("Ana", CPF_VALIDO));

        assertThatThrownBy(() -> clienteService.cadastrarParaUsuario(idUsuario, dados("Outra Ana", CPF_VALIDO)))
                .isInstanceOf(ClienteConflitoException.class);

        assertThat(clienteService.cadastrarParaUsuario(idUsuario, dados("Bruno", null)).getNumero()).isEqualTo(2L);
    }

    /** O cadastro reservou o numero e foi desfeito (rollback): o proximo recebe o mesmo numero. */
    @Test
    void cadastroDesfeitoDepoisDeReservarNaoConsomeNumero() {
        Long idUsuario = novoAdmin(novaEmpresa());
        clienteService.cadastrarParaUsuario(idUsuario, dados("Ana", null));

        Long numeroDesfeito = new TransactionTemplate(transactionManager).execute(status -> {
            Long numero = clienteService.cadastrarParaUsuario(idUsuario, dados("Desfeito", null)).getNumero();
            status.setRollbackOnly();
            return numero;
        });

        assertThat(numeroDesfeito).isEqualTo(2L);
        assertThat(clienteService.cadastrarParaUsuario(idUsuario, dados("Bruno", null)).getNumero()).isEqualTo(2L);
    }

    /** Review Focus 1: cadastros simultaneos na mesma empresa recebem numeros distintos e consecutivos. */
    @Test
    void cadastrosSimultaneosRecebemNumerosDistintos() throws Exception {
        Long idUsuario = novoAdmin(novaEmpresa());
        CyclicBarrier largada = new CyclicBarrier(CADASTROS_SIMULTANEOS);
        ExecutorService executor = Executors.newFixedThreadPool(CADASTROS_SIMULTANEOS);
        try {
            List<Future<Long>> cadastros = new ArrayList<>();
            for (int indice = 0; indice < CADASTROS_SIMULTANEOS; indice++) {
                String nome = "Cliente " + indice;
                cadastros.add(executor.submit(() -> {
                    largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
                    return clienteService.cadastrarParaUsuario(idUsuario, dados(nome, null)).getNumero();
                }));
            }
            List<Long> numeros = new ArrayList<>();
            for (Future<Long> cadastro : cadastros) {
                numeros.add(cadastro.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS));
            }

            assertThat(numeros).containsExactlyInAnyOrderElementsOf(
                    LongStream.rangeClosed(1, CADASTROS_SIMULTANEOS).boxed().toList());
        } finally {
            executor.shutdownNow();
        }
    }

    /** Cada empresa tem a propria sequencia (DEC-016). */
    @Test
    void empresasTemSequenciasIndependentes() {
        Long adminA = novoAdmin(novaEmpresa());
        Long adminB = novoAdmin(novaEmpresa());
        clienteService.cadastrarParaUsuario(adminA, dados("Ana", null));
        clienteService.cadastrarParaUsuario(adminA, dados("Bruno", null));

        assertThat(clienteService.cadastrarParaUsuario(adminB, dados("Carla", null)).getNumero()).isEqualTo(1L);
    }

    // ---------- Apoio ----------

    private static DadosCliente dados(String nome, String cpf) {
        return new DadosCliente(nome, cpf, null, null, null, null);
    }

    /** Empresa FISICA (sem CNPJ), como nos demais ITs; nome unico por teste. */
    private Empresa novaEmpresa() {
        String sufixo = String.valueOf(SEQUENCIA.incrementAndGet());
        String nome = "Empresa Clientes " + sufixo;
        Empresa empresa = new Empresa(nome);
        empresa.atualizarCadastro(
                nome,
                "1133224455",
                "contato" + sufixo + "@clientes.test",
                TipoPessoa.FISICA,
                null,
                null,
                null,
                new RepresentanteLegal("Representante " + sufixo, "11144477735", "11987654321",
                        "rep" + sufixo + "@clientes.test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        return empresaRepository.saveAndFlush(empresa);
    }

    private Long novoAdmin(Empresa empresa) {
        Usuario admin = new Usuario(empresa, "Admin", "admin" + SEQUENCIA.incrementAndGet() + "@clientes.test",
                "hash-irrelevante-no-teste", "ADMIN");
        return usuarioRepository.saveAndFlush(admin).getId();
    }
}
