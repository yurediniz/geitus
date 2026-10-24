package com.geitus.app.catalog.balanca;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.ProdutoService;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.balanca.dto.ConfiguracaoEtiquetaRequest;
import com.geitus.app.catalog.balanca.dto.ConfiguracaoEtiquetaResponse;
import com.geitus.app.catalog.balanca.dto.ProdutoAfetadoResponse;
import com.geitus.app.catalog.balanca.dto.SalvarEtiquetaResponse;
import com.geitus.app.catalog.balanca.dto.TesteEtiquetaRequest;
import com.geitus.app.catalog.balanca.dto.TesteEtiquetaResponse;
import com.geitus.app.catalog.dto.ProdutoRequest;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Teste de integracao da etiqueta de balanca (docs/modules/produtos-codigo-e-balanca.md,
 * 3 e 9) com o contexto Spring completo, transacoes reais e um PostgreSQL real
 * (Testcontainers, Flyway com as migrations de producao): a configuracao por
 * empresa, o aviso de produtos com codigo grande demais (Review Focus 3), o
 * teste de etiqueta e o isolamento por empresa (DEC-016).
 *
 * <p>Sem {@code @Transactional} na classe; cada teste usa empresas novas.
 * Requer Docker.
 */
@SpringBootTest
@Testcontainers
class EtiquetaBalancaIT {

    private static final AtomicInteger SEQUENCIA = new AtomicInteger();
    private static final ConfiguracaoEtiquetaRequest PADRAO =
            new ConfiguracaoEtiquetaRequest("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, false);
    /** "Toledo, codigo 4 + 0 + valor 6 (2 casas) + DV". */
    private static final ConfiguracaoEtiquetaRequest CODIGO_4 =
            new ConfiguracaoEtiquetaRequest("2", 4, 1, TipoInformacaoEtiqueta.VALOR, 6, 2, true);
    /** "Peso, codigo 6 + peso 5 (3 casas) + DV". */
    private static final ConfiguracaoEtiquetaRequest PESO =
            new ConfiguracaoEtiquetaRequest("2", 6, 0, TipoInformacaoEtiqueta.PESO, 5, 3, true);

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
    private EtiquetaBalancaService etiquetaService;

    @Autowired
    private ProdutoService produtoService;

    @Autowired
    private UnidadeMedidaService unidadeService;

    @Autowired
    private EmpresaRepository empresaRepository;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // ---------- Configuracao ----------

    @Test
    void getSemConfiguracaoDevolvePadrao() {
        Empresa empresa = novaEmpresa();
        Long admin = novoAdmin(empresa);

        assertThat(etiquetaService.buscarParaUsuario(admin))
                .isEqualTo(ConfiguracaoEtiquetaResponse.de(ConfiguracaoEtiqueta.padrao(), true));
        assertThat(linhasDeConfiguracao(empresa)).isZero();
    }

    @Test
    void putValidoGravaEDevolve() {
        Empresa empresa = novaEmpresa();
        Long admin = novoAdmin(empresa);

        SalvarEtiquetaResponse salva = etiquetaService.salvarParaUsuario(admin, CODIGO_4);
        etiquetaService.salvarParaUsuario(admin, PESO);

        assertThat(salva.configuracao()).isEqualTo(ConfiguracaoEtiquetaResponse.de(CODIGO_4.paraConfiguracao(),
                false));
        assertThat(salva.produtosComCodigoGrandeDemais()).isEmpty();
        assertThat(etiquetaService.buscarParaUsuario(admin))
                .isEqualTo(ConfiguracaoEtiquetaResponse.de(PESO.paraConfiguracao(), false));
        assertThat(linhasDeConfiguracao(empresa)).isEqualTo(1);
        assertThat(etiquetaService.configuracaoDaEmpresa(empresa.getId())).isEqualTo(PESO.paraConfiguracao());
    }

    /** Rastro provisorio ate a auditoria: INFO so com ids e o formato salvo. */
    @Test
    void salvarRegistraRastroSoComIdsEFormato() {
        Empresa empresa = novaEmpresa();
        Long admin = novoAdmin(empresa);
        Logger logDoService = (Logger) LoggerFactory.getLogger(EtiquetaBalancaService.class);
        ListAppender<ILoggingEvent> capturados = new ListAppender<>();
        capturados.start();
        logDoService.addAppender(capturados);
        try {
            etiquetaService.salvarParaUsuario(admin, CODIGO_4);
        } finally {
            logDoService.detachAppender(capturados);
        }

        assertThat(capturados.list).singleElement().satisfies(evento -> {
            assertThat(evento.getLevel()).isEqualTo(Level.INFO);
            assertThat(evento.getFormattedMessage()).isEqualTo("Etiqueta de balanca salva: usuario=" + admin
                    + " empresa=" + empresa.getId() + " formato=2|codigo 4|preenchimento 1|VALOR 6|casas 2|com DV");
        });
    }

    @Test
    void putComSomaDiferenteDe13_400SemGravar() {
        Empresa empresa = novaEmpresa();
        Long admin = novoAdmin(empresa);

        assertThatThrownBy(() -> etiquetaService.salvarParaUsuario(admin,
                new ConfiguracaoEtiquetaRequest("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 6, 3, true)))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A etiqueta precisa ter 13 dígitos no total (hoje: 14).");
        assertThat(linhasDeConfiguracao(empresa)).isZero();
    }

    /**
     * Review Focus 3: com produtos de codigo 12345 e 123456 "Vendidos na
     * balanca", trocar para 4 digitos de codigo salva e lista os dois (em ordem
     * de codigo); quem cabe (9999) ou nao e da balanca (54321) fica fora. Depois,
     * salvar um dos afetados sem mudar o codigo da 400 com a mensagem de tamanho.
     */
    @Test
    void putDevolveProdutosComCodigoGrandeDemais() {
        Empresa empresa = novaEmpresa();
        Long admin = novoAdmin(empresa);
        UUID kg = unidade(empresa, admin, "KG");
        ProdutoResponse grande = cadastrar(admin, kg, "Açúcar a granel", 12345, true);
        ProdutoResponse maior = cadastrar(admin, kg, "Feijão a granel", 123456, true);
        cadastrar(admin, kg, "Arroz a granel", 9999, true);
        cadastrar(admin, kg, "Café em pacote", 54321, false);

        SalvarEtiquetaResponse salva = etiquetaService.salvarParaUsuario(admin, CODIGO_4);

        assertThat(salva.configuracao().digitosCodigo()).isEqualTo(4);
        assertThat(salva.produtosComCodigoGrandeDemais()).containsExactly(
                new ProdutoAfetadoResponse(grande.id(), grande.numero(), "Açúcar a granel", 12345),
                new ProdutoAfetadoResponse(maior.id(), maior.numero(), "Feijão a granel", 123456));
        assertThatThrownBy(() -> produtoService.atualizarDadosBasicosParaUsuario(admin, grande.id(),
                requestDoProduto(kg, "Açúcar a granel", 12345, true)))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Este código tem mais dígitos do que a etiqueta da balança comporta (4).")
                .extracting(erro -> ((RegraDeNegocioException) erro).campo().orElseThrow()).isEqualTo("codigo");
    }

    // ---------- Teste de etiqueta ----------

    @Test
    void testeComProdutoEncontrado() {
        Empresa empresa = novaEmpresa();
        Long operador = novoOperador(empresa);
        Long admin = novoAdmin(empresa);
        UUID kg = unidade(empresa, admin, "KG");
        ProdutoResponse acucar = cadastrar(admin, kg, "Açúcar a granel", 542, true);

        TesteEtiquetaResponse teste = etiquetaService.testarParaUsuario(operador,
                new TesteEtiquetaRequest(" 2000542010000 ", PADRAO));

        assertThat(teste.leitura()).isEqualTo(
                new TesteEtiquetaResponse.Leitura(542, TipoInformacaoEtiqueta.VALOR, new BigDecimal("10.000")));
        assertThat(teste.produto()).isEqualTo(
                new TesteEtiquetaResponse.ProdutoDaEtiqueta(acucar.id(), acucar.numero(), "Açúcar a granel", "KG"));
        assertThat(teste.mensagem()).isEqualTo("Produto 542 · Açúcar a granel · R$ 10,00");
    }

    /** O teste usa a configuracao da TELA, nao a gravada (aqui, peso com DV). */
    @Test
    void testeComPesoUsaAConfiguracaoDaTela() {
        Empresa empresa = novaEmpresa();
        Long admin = novoAdmin(empresa);
        UUID kg = unidade(empresa, admin, "KG");
        cadastrar(admin, kg, "Açúcar a granel", 542, true);

        TesteEtiquetaResponse teste = etiquetaService.testarParaUsuario(admin,
                new TesteEtiquetaRequest("2000542007503", PESO));

        assertThat(teste.mensagem()).isEqualTo("Produto 542 · Açúcar a granel · 0,750 kg");
        assertThat(etiquetaService.buscarParaUsuario(admin).padrao()).isTrue();
    }

    @Test
    void testeProdutoNaoCadastrado() {
        Long admin = novoAdmin(novaEmpresa());

        TesteEtiquetaResponse teste = etiquetaService.testarParaUsuario(admin,
                new TesteEtiquetaRequest("2000542010000", PADRAO));

        assertThat(teste.leitura().codigoProduto()).isEqualTo(542);
        assertThat(teste.produto()).isNull();
        assertThat(teste.mensagem()).isEqualTo("Produto 542 não cadastrado");
    }

    @Test
    void testeForaDoFormato() {
        Long admin = novoAdmin(novaEmpresa());

        TesteEtiquetaResponse teste = etiquetaService.testarParaUsuario(admin,
                new TesteEtiquetaRequest("7891000315507", PADRAO));

        assertThat(teste.leitura()).isNull();
        assertThat(teste.produto()).isNull();
        assertThat(teste.mensagem()).isEqualTo("Este número não é uma etiqueta neste formato.");
    }

    @Test
    void testeComConfiguracaoInvalida_400() {
        Long admin = novoAdmin(novaEmpresa());

        assertThatThrownBy(() -> etiquetaService.testarParaUsuario(admin, new TesteEtiquetaRequest("2000542010000",
                new ConfiguracaoEtiquetaRequest("2", 6, 0, TipoInformacaoEtiqueta.VALOR, 5, 3, false))))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A etiqueta precisa ter 13 dígitos no total (hoje: 12).");
    }

    // ---------- Isolamento por empresa (DEC-016) ----------

    @Test
    void isolamentoPorEmpresa() {
        Empresa empresaA = novaEmpresa();
        Long adminA = novoAdmin(empresaA);
        Empresa empresaB = novaEmpresa();
        Long adminB = novoAdmin(empresaB);
        UUID kgA = unidade(empresaA, adminA, "KG");
        UUID kgB = unidade(empresaB, adminB, "KG");
        cadastrar(adminA, kgA, "Açúcar da A", 542, true);
        cadastrar(adminB, kgB, "Feijão da B", 12345, true);

        SalvarEtiquetaResponse salvaPelaA = etiquetaService.salvarParaUsuario(adminA, CODIGO_4);

        assertThat(salvaPelaA.produtosComCodigoGrandeDemais()).isEmpty();
        assertThat(etiquetaService.buscarParaUsuario(adminB).padrao()).isTrue();
        assertThat(etiquetaService.configuracaoDaEmpresa(empresaB.getId())).isEqualTo(ConfiguracaoEtiqueta.padrao());
        assertThat(etiquetaService.testarParaUsuario(adminB, new TesteEtiquetaRequest("2000542010000", PADRAO))
                .mensagem()).isEqualTo("Produto 542 não cadastrado");
        assertThat(etiquetaService.testarParaUsuario(adminA, new TesteEtiquetaRequest("2000542010000", PADRAO))
                .mensagem()).isEqualTo("Produto 542 · Açúcar da A · R$ 10,00");
    }

    // ---------- Apoio ----------

    private ProdutoResponse cadastrar(Long admin, UUID unidade, String nome, Integer codigo, boolean balanca) {
        return produtoService.cadastrarParaUsuario(admin, requestDoProduto(unidade, nome, codigo, balanca));
    }

    private static ProdutoRequest requestDoProduto(UUID unidade, String nome, Integer codigo, boolean balanca) {
        return new ProdutoRequest(nome, null, null, null, null, unidade, null, new BigDecimal("10.00"),
                null, null, null, null, null, List.of(), null, codigo, balanca, null, null, true, null);
    }

    private UUID unidade(Empresa empresa, Long admin, String sigla) {
        unidadeService.criarPadroes(empresa);
        return unidadeService.listarParaUsuario(admin, null).stream()
                .filter(unidade -> unidade.sigla().equals(sigla))
                .map(UnidadeMedidaResponse::id)
                .findFirst()
                .orElseThrow();
    }

    private long linhasDeConfiguracao(Empresa empresa) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM configuracoes_etiqueta_balanca WHERE empresa_id = ?",
                Long.class, empresa.getId());
    }

    /** Empresa FISICA (sem CNPJ), como nos demais ITs; nome unico por teste. */
    private Empresa novaEmpresa() {
        String sufixo = String.valueOf(SEQUENCIA.incrementAndGet());
        String nome = "Empresa Balanca " + sufixo;
        Empresa empresa = new Empresa(nome);
        empresa.atualizarCadastro(
                nome,
                "1133224455",
                "contato" + sufixo + "@balanca.test",
                TipoPessoa.FISICA,
                null,
                null,
                null,
                new RepresentanteLegal("Representante " + sufixo, "11144477735", "11987654321",
                        "rep" + sufixo + "@balanca.test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        return empresaRepository.saveAndFlush(empresa);
    }

    private Long novoAdmin(Empresa empresa) {
        return novoUsuario(empresa, "ADMIN");
    }

    private Long novoOperador(Empresa empresa) {
        return novoUsuario(empresa, "OPERADOR");
    }

    private Long novoUsuario(Empresa empresa, String perfil) {
        Usuario usuario = new Usuario(empresa, perfil, perfil.toLowerCase() + SEQUENCIA.incrementAndGet()
                + "@balanca.test", "hash-irrelevante-no-teste", perfil);
        return usuarioRepository.saveAndFlush(usuario).getId();
    }
}
