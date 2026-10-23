package com.geitus.app.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase.Replace;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.ReflectionTestUtils;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;

/**
 * Teste de integracao do {@link ClienteRepository} contra um PostgreSQL real
 * (Testcontainers). Exercita a migration V5, as queries derivadas e as JPQL de
 * busca de verdade — o {@code @WebMvcTest} com mock nao faz isso (licao do bug
 * {@code lower(bytea)} no {@code ProdutoRepository}). Cobre isolamento por
 * empresa (DEC-016), UUID publico (DEC-019/029), unicidade do CPF por empresa,
 * CPF de cliente inativo continua reservado (DEC-029), os CHECKs de coerencia
 * do WhatsApp e de formato (so digitos), filtro de status (inclusive nas
 * buscas), ordenacao, busca por nome/digitos e o tratamento de {@code %}/{@code _}
 * como literais.
 *
 * <p>Usa o banco do container via {@code @AutoConfigureTestDatabase(replace =
 * NONE)} e deixa o Flyway aplicar as migrations reais.
 *
 * <p>Requer Docker disponivel no ambiente.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Testcontainers
class ClienteRepositoryIT {

    /** Numero de registro (V11, unico por empresa): sequencia global do teste, sem colisao. */
    private static final AtomicLong PROXIMO_NUMERO = new AtomicLong();
    private static final String CPF_VALIDO = "11144477735";
    private static final String TELEFONE_VALIDO = "11987654321";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configurarDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        // Schema definido pelas migrations Flyway (mesmas de producao); o
        // Hibernate apenas valida.
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private ClienteRepository clienteRepository;

    @Autowired
    private EmpresaRepository empresaRepository;

    private Empresa novaEmpresa(String nome) {
        Empresa empresa = new Empresa(nome);
        // Empresa FISICA (sem CNPJ): satisfaz as colunas NOT NULL e a coerencia
        // PJ/PF da migration V3, e evita colisao de CNPJ ao criar varias empresas.
        empresa.atualizarCadastro(
                nome,
                "1133224455",
                "contato@" + nome.toLowerCase().replaceAll("[^a-z0-9]", "") + ".test",
                TipoPessoa.FISICA,
                null,
                null,
                null,
                new RepresentanteLegal("Representante " + nome, "11144477735", "11987654321",
                        "rep@" + nome.toLowerCase().replaceAll("[^a-z0-9]", "") + ".test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        return empresaRepository.saveAndFlush(empresa);
    }

    private static long proximoNumero() {
        return PROXIMO_NUMERO.incrementAndGet();
    }

    private Cliente novoCliente(Empresa empresa, String nome, String cpf, String telefone) {
        return clienteRepository.saveAndFlush(
                new Cliente(empresa, proximoNumero(), nome, cpf, telefone, true, null, null));
    }

    private Cliente novoClienteComWhatsappProprio(Empresa empresa, String nome, String telefone,
            String whatsapp) {
        return clienteRepository.saveAndFlush(
                new Cliente(empresa, proximoNumero(), nome, null, telefone, false, whatsapp, null));
    }

    // ---------- Isolamento por empresa (DEC-016) e UUID publico ----------

    @Test
    void buscarPorUuidNaoEncontraClienteDeOutraEmpresa() {
        Empresa empresaA = novaEmpresa("Empresa A");
        Empresa empresaB = novaEmpresa("Empresa B");
        UUID uuidDaEmpresaA = novoCliente(empresaA, "Ana", null, null).getUuid();

        assertThat(clienteRepository.findByUuidAndEmpresa_Id(uuidDaEmpresaA, empresaB.getId())).isEmpty();
        assertThat(clienteRepository.findByUuidAndEmpresa_Id(uuidDaEmpresaA, empresaA.getId())).isPresent();
    }

    @Test
    void listagensNaoRetornamClientesDeOutraEmpresa() {
        Empresa empresaA = novaEmpresa("Empresa Lista A");
        Empresa empresaB = novaEmpresa("Empresa Lista B");
        Cliente daEmpresaA = novoCliente(empresaA, "Ana", null, TELEFONE_VALIDO);
        novoCliente(empresaB, "Ana", null, TELEFONE_VALIDO);
        Long idEmpresaA = empresaA.getId();

        assertThat(clienteRepository.buscarPorEmpresa(idEmpresaA, null))
                .extracting(Cliente::getId).containsExactly(daEmpresaA.getId());
        assertThat(clienteRepository.buscarPorNome(idEmpresaA, "%ana%", null))
                .extracting(Cliente::getId).containsExactly(daEmpresaA.getId());
        assertThat(clienteRepository.buscarPorNomeOuDigitos(idEmpresaA, "%ana%", "%98765%", null))
                .extracting(Cliente::getId).containsExactly(daEmpresaA.getId());
    }

    @Test
    void uuidEGeradoNaCriacaoEUnico() {
        Empresa empresa = novaEmpresa("Empresa UUID");
        Cliente naoSalvo = new Cliente(empresa, proximoNumero(), "Ana", null, null, true, null, null);
        // Gerado na aplicacao, antes de qualquer INSERT (o DEFAULT do banco e so rede de seguranca).
        UUID uuidGeradoNaAplicacao = naoSalvo.getUuid();
        assertThat(uuidGeradoNaAplicacao).isNotNull();

        Cliente primeiro = clienteRepository.saveAndFlush(naoSalvo);
        Cliente segundo = novoCliente(empresa, "Bruno", null, null);
        entityManager.clear();

        Cliente primeiroRelido = clienteRepository.findById(primeiro.getId()).orElseThrow();
        assertThat(primeiroRelido.getUuid()).isEqualTo(uuidGeradoNaAplicacao);
        assertThat(segundo.getUuid()).isNotNull().isNotEqualTo(primeiroRelido.getUuid());
    }

    // ---------- Unicidade do CPF por empresa ----------

    @Test
    void cpfDuplicadoNaMesmaEmpresaViolaConstraint() {
        Empresa empresaA = novaEmpresa("Empresa CPF A");
        Empresa empresaB = novaEmpresa("Empresa CPF B");
        Cliente donoDoCpf = novoCliente(empresaA, "Ana", CPF_VALIDO, null);
        Cliente outroDaEmpresaA = novoCliente(empresaA, "Bruno", null, null);

        // Mesmo CPF em outra empresa e permitido (unicidade e por empresa).
        novoCliente(empresaB, "Ana em B", CPF_VALIDO, null);
        assertThat(clienteRepository.existsByCpfAndEmpresa_Id(CPF_VALIDO, empresaB.getId())).isTrue();

        // Na edicao: o proprio cliente nao conflita consigo; outro da mesma empresa conflita.
        assertThat(clienteRepository.existsByCpfAndEmpresa_IdAndIdNot(CPF_VALIDO, empresaA.getId(),
                donoDoCpf.getId())).isFalse();
        assertThat(clienteRepository.existsByCpfAndEmpresa_IdAndIdNot(CPF_VALIDO, empresaA.getId(),
                outroDaEmpresaA.getId())).isTrue();

        // Fica por ultimo: apos a violacao a transacao do Postgres fica abortada.
        assertThatThrownBy(() -> novoCliente(empresaA, "Outra Ana", CPF_VALIDO, null))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void cpfDeClienteInativoContinuaReservado() {
        // DEC-029: inativar nao libera o CPF; a checagem do service continua
        // encontrando-o (e a UNIQUE do banco nao filtra por status).
        Empresa empresa = novaEmpresa("Empresa CPF Inativo");
        Cliente inativo = novoCliente(empresa, "Ana", CPF_VALIDO, null);
        inativo.inativar();
        clienteRepository.saveAndFlush(inativo);

        assertThat(clienteRepository.existsByCpfAndEmpresa_Id(CPF_VALIDO, empresa.getId())).isTrue();
    }

    @Test
    void variosClientesSemCpfNaoConflitam() {
        Empresa empresa = novaEmpresa("Empresa Sem CPF");
        novoCliente(empresa, "Sem CPF 1", null, null);
        novoCliente(empresa, "Sem CPF 2", null, null);
        novoCliente(empresa, "Sem CPF 3", null, null);

        // UNIQUE (empresa_id, cpf) trata multiplos NULL como nao-conflitantes.
        assertThat(clienteRepository.buscarPorEmpresa(empresa.getId(), null)).hasSize(3);
    }

    // ---------- CHECK de coerencia do WhatsApp ----------

    @Test
    void whatsappComTelefoneEWhatsappVerdadeiroViolaCheck() {
        Empresa empresa = novaEmpresa("Empresa WhatsApp");
        Cliente cliente = novoClienteComWhatsappProprio(empresa, "Ana", "11987654321", "11912345678");

        // O service normaliza (whatsapp = null quando telefoneEWhatsapp = true);
        // aqui o objetivo e provar que o banco tambem protege a regra.
        cliente.atualizarDados("Ana", null, "11987654321", true, "11912345678", null);

        assertThatThrownBy(() -> clienteRepository.saveAndFlush(cliente))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // ---------- CHECKs de formato ----------

    @Test
    void cpfComMascaraViolaCheckDeFormato() {
        Empresa empresa = novaEmpresa("Empresa Formato");
        // 11 caracteres (cabe no VARCHAR(11)), mas nao sao so digitos: o service
        // normaliza antes; o CHECK ck_cliente_cpf_digitos e a defesa no banco.
        Cliente comMascara = new Cliente(empresa, proximoNumero(), "Ana", "111.444.777", null, true, null,
                null);

        assertThatThrownBy(() -> clienteRepository.saveAndFlush(comMascara))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // ---------- Listagem e busca ----------

    @Test
    void buscarPorEmpresaFiltraPorStatusEOrdenaPorNome() {
        Empresa empresa = novaEmpresa("Empresa Status");
        novoCliente(empresa, "Carla", null, null);
        novoCliente(empresa, "Ana", null, null);
        Cliente inativo = novoCliente(empresa, "Bruno", null, null);
        inativo.inativar();
        clienteRepository.saveAndFlush(inativo);

        assertThat(clienteRepository.buscarPorEmpresa(empresa.getId(), null))
                .extracting(Cliente::getNome).containsExactly("Ana", "Bruno", "Carla");
        assertThat(clienteRepository.buscarPorEmpresa(empresa.getId(), false))
                .extracting(Cliente::getNome).containsExactly("Bruno");
    }

    @Test
    void buscasRespeitamFiltroDeStatus() {
        Empresa empresa = novaEmpresa("Empresa Filtro Busca");
        Cliente ativo = novoCliente(empresa, "Ana Ativa", null, TELEFONE_VALIDO);
        Cliente inativo = novoCliente(empresa, "Ana Inativa", null, TELEFONE_VALIDO);
        inativo.inativar();
        clienteRepository.saveAndFlush(inativo);
        Long idEmpresa = empresa.getId();

        assertThat(clienteRepository.buscarPorNomeOuDigitos(idEmpresa, "%ana%", "%98765%", true))
                .extracting(Cliente::getId).containsExactly(ativo.getId());
        assertThat(clienteRepository.buscarPorNomeOuDigitos(idEmpresa, "%ana%", "%98765%", false))
                .extracting(Cliente::getId).containsExactly(inativo.getId());
        assertThat(clienteRepository.buscarPorNome(idEmpresa, "%ana%", true))
                .extracting(Cliente::getId).containsExactly(ativo.getId());
        assertThat(clienteRepository.buscarPorNome(idEmpresa, "%ana%", false))
                .extracting(Cliente::getId).containsExactly(inativo.getId());
    }

    @Test
    void buscarPorNomeIgnoraMaiusculas() {
        Empresa empresa = novaEmpresa("Empresa Nome");
        novoCliente(empresa, "ANA Souza", null, null);
        novoCliente(empresa, "Mariana", null, null);
        novoCliente(empresa, "Bruno", null, null);

        assertThat(clienteRepository.buscarPorNome(empresa.getId(), "%ana%", null))
                .extracting(Cliente::getNome).containsExactly("ANA Souza", "Mariana");
    }

    @Test
    void buscarPorNomeOuDigitosEncontraPorTelefoneCpfEWhatsapp() {
        Empresa empresa = novaEmpresa("Empresa Digitos");
        novoCliente(empresa, "Pelo Telefone", null, "11987654321");
        novoClienteComWhatsappProprio(empresa, "Pelo WhatsApp", "1133224455", "11998765000");
        novoCliente(empresa, "Pelo CPF", CPF_VALIDO, null);
        novoCliente(empresa, "Sem Os Digitos", null, "21912340000");
        // Padrao de nome que nao casa com ninguem: so os digitos decidem.
        String padraoNomeSemCasamento = "%(11) 98765%";

        assertThat(clienteRepository.buscarPorNomeOuDigitos(empresa.getId(), padraoNomeSemCasamento, "%98765%", null))
                .extracting(Cliente::getNome).containsExactly("Pelo Telefone", "Pelo WhatsApp");
        assertThat(clienteRepository.buscarPorNomeOuDigitos(empresa.getId(), "%444777%", "%444777%", null))
                .extracting(Cliente::getNome).containsExactly("Pelo CPF");
    }

    @Test
    void buscaTrataPercentualESublinhadoComoLiterais() {
        Empresa empresa = novaEmpresa("Empresa Curingas");
        novoCliente(empresa, "100% Pet", null, null);
        // "1000 Pet" casaria se o % do termo agisse como curinga ("100" + qualquer coisa).
        novoCliente(empresa, "1000 Pet", null, null);
        novoCliente(empresa, "Loja X", null, null);

        // Padroes ja escapados, como o service os montara.
        assertThat(clienteRepository.buscarPorNome(empresa.getId(), "%100\\%%", null))
                .extracting(Cliente::getNome).containsExactly("100% Pet");
        assertThat(clienteRepository.buscarPorNome(empresa.getId(), "%\\_%", null)).isEmpty();
        assertThat(clienteRepository.buscarPorNomeOuDigitos(empresa.getId(), "%\\_%", "%\\_%", null)).isEmpty();

        // Com um "_" literal no nome, o mesmo padrao passa a encontra-lo (e so ele).
        novoCliente(empresa, "Pet_Shop Ana", null, null);
        assertThat(clienteRepository.buscarPorNome(empresa.getId(), "%\\_%", null))
                .extracting(Cliente::getNome).containsExactly("Pet_Shop Ana");
        assertThat(clienteRepository.buscarPorNomeOuDigitos(empresa.getId(), "%\\_%", "%\\_%", null))
                .extracting(Cliente::getNome).containsExactly("Pet_Shop Ana");
    }

    // ---------- Fase B2: numero de registro ----------

    /** {@code updatable = false}: mudar o numero na entidade nao chega ao banco, mesmo com outro UPDATE. */
    @Test
    void numeroDoClienteNaoEAtualizadoDepoisDaCriacao() {
        Empresa empresa = novaEmpresa("Empresa Numero Cliente");
        Cliente cliente = clienteRepository.saveAndFlush(new Cliente(empresa, 12, "Ana", null, null, true, null, null));

        ReflectionTestUtils.setField(cliente, "numero", 99L);
        cliente.inativar();
        clienteRepository.saveAndFlush(cliente);
        entityManager.clear();

        Cliente relido = clienteRepository.findByUuidAndEmpresa_Id(cliente.getUuid(), empresa.getId()).orElseThrow();
        assertThat(relido.getNumero()).isEqualTo(12L);
        assertThat(relido.isAtivo()).isFalse();
    }
}
