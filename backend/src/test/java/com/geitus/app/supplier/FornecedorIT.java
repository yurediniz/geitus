package com.geitus.app.supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.catalog.marca.MarcaService;
import com.geitus.app.catalog.marca.dto.MarcaRequest;
import com.geitus.app.catalog.marca.dto.MarcaResponse;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.supplier.dto.FornecedorItemResponse;
import com.geitus.app.supplier.dto.FornecedorResponse;
import com.geitus.app.supplier.dto.RepresentanteRequest;

/**
 * Fornecedores (Fase B5) com o contexto Spring completo e um PostgreSQL real
 * (Testcontainers, Flyway ate a V14): gravacao com representantes e marcas,
 * a lista completa de representantes, a numeracao, a busca sem acento por
 * cada criterio, status e paginacao, o documento unico por empresa, a
 * exclusao com produtos ou entradas e o isolamento entre empresas
 * (docs/modules/fornecedores-e-marcas.md, 4 e 10).
 *
 * <p>Sem {@code @Transactional} na classe: cada chamada de service confirma a
 * propria transacao, como em producao. Ligacoes com produto e movimentos sao
 * gravadas direto no banco (as telas deles sao da Task 5). Requer Docker.
 */
@SpringBootTest
@Testcontainers
class FornecedorIT {

    private static final AtomicInteger SEQUENCIA = new AtomicInteger();
    private static final String CNPJ = "11.222.333/0001-81";
    private static final int PAGINA = 0;
    private static final int TAMANHO = 25;

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
    private EmpresaRepository empresaRepository;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private UnidadeMedidaService unidadeService;

    @Autowired
    private MarcaService marcaService;

    @Autowired
    private FornecedorService fornecedorService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // ---------- Cadastro ----------

    @Test
    void cadastroCompletoComRepresentantesEMarcasNumerado() {
        Loja loja = novaLoja();
        MarcaResponse boehringer = marcaService.cadastrarParaUsuario(loja.admin(), new MarcaRequest("Boehringer", null));
        MarcaResponse nexgard = marcaService.cadastrarParaUsuario(loja.admin(),
                new MarcaRequest("Nexgard", boehringer.id()));

        FornecedorResponse primeiro = fornecedorService.cadastrarParaUsuario(loja.admin(), request("Distribuidora São João")
                .documento(CNPJ).inscricaoEstadual("isento").cep("01001-000").uf("sp").telefone("(11) 3322-4455")
                .representantes(new RepresentanteRequest(null, "Ana Lúcia", "(11) 98765-4321", null),
                        new RepresentanteRequest(null, "Bruno", null, "bruno@sj.com.br"))
                .marcaIds(nexgard.id(), boehringer.id()).build());
        FornecedorResponse segundo = fornecedorService.cadastrarParaUsuario(loja.admin(), request("Atacado").build());

        assertThat(primeiro.numero()).isEqualTo(1L);
        assertThat(segundo.numero()).isEqualTo(2L);
        FornecedorResponse relido = fornecedorService.buscarParaUsuario(loja.admin(), primeiro.id());
        assertThat(relido.documento()).isEqualTo("11222333000181");
        assertThat(relido.inscricaoEstadual()).isEqualTo("ISENTO");
        assertThat(relido.cep()).isEqualTo("01001000");
        assertThat(relido.uf()).isEqualTo("SP");
        assertThat(relido.representantes()).extracting(representante -> representante.nome())
                .containsExactly("Ana Lúcia", "Bruno");
        assertThat(relido.marcas()).extracting(marca -> marca.caminho())
                .containsExactly("Boehringer", "Boehringer › Nexgard");
        assertThat(relido.quantidadeProdutos()).isZero();
    }

    @Test
    void listaCompletaDeRepresentantesMantemCriaRemoveEReordena() {
        Loja loja = novaLoja();
        FornecedorResponse fornecedor = fornecedorService.cadastrarParaUsuario(loja.admin(), request("Distribuidora")
                .representantes(new RepresentanteRequest(null, "Ana", null, null),
                        new RepresentanteRequest(null, "Bruno", null, null))
                .build());
        UUID ana = fornecedor.representantes().get(0).id();

        FornecedorResponse atualizado = fornecedorService.atualizarParaUsuario(loja.admin(), fornecedor.id(),
                request("Distribuidora").representantes(new RepresentanteRequest(null, "Carla", null, null),
                        new RepresentanteRequest(ana, "Ana Maria", "11987654321", null)).build());

        assertThat(atualizado.representantes()).extracting(representante -> representante.nome())
                .containsExactly("Carla", "Ana Maria");
        assertThat(atualizado.representantes().get(1).id()).isEqualTo(ana);
        assertThat(jdbcTemplate.queryForObject("SELECT string_agg(nome || ':' || ordem, ',' ORDER BY ordem)"
                + " FROM fornecedor_representantes WHERE empresa_id = ?", String.class, loja.empresa().getId()))
                .isEqualTo("Carla:0,Ana Maria:1");
        assertThat(listar(loja, "bruno", null).totalItens()).isZero();
        assertThat(listar(loja, "carla", null).totalItens()).isEqualTo(1);
    }

    @Test
    void documentoUnicoSoDentroDaEmpresa() {
        Loja loja = novaLoja();
        Loja outra = novaLoja();
        fornecedorService.cadastrarParaUsuario(loja.admin(), request("Atacado Sul").documento(CNPJ).build());

        assertThatThrownBy(() -> fornecedorService.cadastrarParaUsuario(loja.admin(),
                request("Outro").documento("11222333000181").build()))
                .isInstanceOf(FornecedorConflitoException.class)
                .hasMessage("Já existe o fornecedor Atacado Sul com este CNPJ.");
        assertThatCode(() -> fornecedorService.cadastrarParaUsuario(outra.admin(),
                request("Atacado Sul").documento(CNPJ).build())).doesNotThrowAnyException();
    }

    // ---------- Busca, status e paginacao ----------

    @Test
    void buscaPorNomeFantasiaDocumentoNumeroERepresentante() {
        Loja loja = novaLoja();
        fornecedorService.cadastrarParaUsuario(loja.admin(), request("Distribuidora São João").build());
        fornecedorService.cadastrarParaUsuario(loja.admin(), request("Comercial Ltda").nomeFantasia("Pet Amigo")
                .documento(CNPJ).representantes(new RepresentanteRequest(null, "Joaquim Brás", null, null)).build());
        fornecedorService.cadastrarParaUsuario(loja.admin(), request("Zebra Pet").build());

        assertThat(nomes(listar(loja, "sao joao", null))).containsExactly("Distribuidora São João");
        assertThat(nomes(listar(loja, "AMIGO", null))).containsExactly("Comercial Ltda");
        assertThat(nomes(listar(loja, "11.222.333", null))).containsExactly("Comercial Ltda");
        assertThat(nomes(listar(loja, "0001-81", null))).containsExactly("Comercial Ltda");
        assertThat(nomes(listar(loja, "3", null))).containsExactly("Comercial Ltda", "Zebra Pet");
        assertThat(nomes(listar(loja, "joaquim bras", null))).containsExactly("Comercial Ltda");
        assertThat(nomes(listar(loja, "pet", null))).containsExactly("Comercial Ltda", "Zebra Pet");
        assertThat(nomes(listar(loja, "50%", null))).isEmpty();
    }

    @Test
    void statusEPaginacaoPorNome() {
        Loja loja = novaLoja();
        FornecedorResponse inativo = fornecedorService.cadastrarParaUsuario(loja.admin(), request("Beta").build());
        fornecedorService.cadastrarParaUsuario(loja.admin(), request("Ácido Distribuidora").build());
        fornecedorService.cadastrarParaUsuario(loja.admin(), request("Gama").build());
        fornecedorService.inativarParaUsuario(loja.admin(), inativo.id());

        assertThat(nomes(listar(loja, null, null))).containsExactly("Ácido Distribuidora", "Gama");
        assertThat(nomes(listar(loja, null, "inativos"))).containsExactly("Beta");
        PaginaResponse<FornecedorItemResponse> segunda = fornecedorService.listarParaUsuario(loja.admin(), null,
                "todos", 1, 2);
        assertThat(nomes(segunda)).containsExactly("Gama");
        assertThat(segunda.totalItens()).isEqualTo(3);
        assertThatThrownBy(() -> listar(loja, null, "excluidos")).isInstanceOf(RegraDeNegocioException.class);

        fornecedorService.reativarParaUsuario(loja.admin(), inativo.id());
        assertThat(nomes(listar(loja, null, null))).containsExactly("Ácido Distribuidora", "Beta", "Gama");
    }

    @Test
    void listagemTrazORepresentantePrincipalEAsContagensDeProdutos() {
        Loja loja = novaLoja();
        FornecedorResponse fornecedor = fornecedorService.cadastrarParaUsuario(loja.admin(), request("Distribuidora")
                .representantes(new RepresentanteRequest(null, "Ana", "11987654321", null),
                        new RepresentanteRequest(null, "Bruno", null, null))
                .build());
        ligarAProduto(loja, fornecedor.id(), "Arroz");
        ligarAProduto(loja, fornecedor.id(), "Feijão");

        FornecedorItemResponse item = listar(loja, null, null).itens().get(0);

        assertThat(item.representantePrincipal().nome()).isEqualTo("Ana");
        assertThat(item.representantePrincipal().telefone()).isEqualTo("11987654321");
        assertThat(item.quantidadeProdutos()).isEqualTo(2);
        assertThat(fornecedorService.buscarParaUsuario(loja.admin(), fornecedor.id()).quantidadeProdutos())
                .isEqualTo(2);
    }

    // ---------- Exclusao ----------

    @Test
    void exclusaoComProdutoOuEntradaE409ESemVinculosApagaAsListas() {
        Loja loja = novaLoja();
        MarcaResponse golden = marcaService.cadastrarParaUsuario(loja.admin(), new MarcaRequest("Golden", null));
        FornecedorResponse comProduto = fornecedorService.cadastrarParaUsuario(loja.admin(), request("Com produto")
                .build());
        FornecedorResponse comEntrada = fornecedorService.cadastrarParaUsuario(loja.admin(), request("Com entrada")
                .build());
        FornecedorResponse livre = fornecedorService.cadastrarParaUsuario(loja.admin(), request("Livre")
                .representantes(new RepresentanteRequest(null, "Ana", null, null)).marcaIds(golden.id()).build());
        ligarAProduto(loja, comProduto.id(), "Arroz");
        registrarEntrada(loja, comEntrada.id());

        assertThatThrownBy(() -> fornecedorService.excluirParaUsuario(loja.admin(), comProduto.id()))
                .isInstanceOf(FornecedorConflitoException.class)
                .hasMessage("Não é possível excluir: o fornecedor tem 1 produto(s) ligados e 0 entrada(s) "
                        + "registradas. Inative-o.");
        assertThatThrownBy(() -> fornecedorService.excluirParaUsuario(loja.admin(), comEntrada.id()))
                .isInstanceOf(FornecedorConflitoException.class)
                .hasMessage("Não é possível excluir: o fornecedor tem 0 produto(s) ligados e 1 entrada(s) "
                        + "registradas. Inative-o.");

        fornecedorService.excluirParaUsuario(loja.admin(), livre.id());

        assertThat(contar("fornecedor_representantes", loja)).isZero();
        assertThat(contar("fornecedor_marcas", loja)).isZero();
        assertThat(contar("fornecedores", loja)).isEqualTo(2);
    }

    // ---------- Isolamento ----------

    @Test
    void fornecedorDeOutraEmpresaNaoEVistoNemAlterado() {
        Loja loja = novaLoja();
        Loja outra = novaLoja();
        FornecedorResponse daOutra = fornecedorService.cadastrarParaUsuario(outra.admin(), request("Da outra").build());
        MarcaResponse marcaDaOutra = marcaService.cadastrarParaUsuario(outra.admin(), new MarcaRequest("Golden", null));

        assertThatThrownBy(() -> fornecedorService.buscarParaUsuario(loja.admin(), daOutra.id()))
                .isInstanceOf(FornecedorNaoEncontradoException.class);
        assertThatThrownBy(() -> fornecedorService.atualizarParaUsuario(loja.admin(), daOutra.id(),
                request("Tomado").build())).isInstanceOf(FornecedorNaoEncontradoException.class);
        assertThatThrownBy(() -> fornecedorService.excluirParaUsuario(loja.admin(), daOutra.id()))
                .isInstanceOf(FornecedorNaoEncontradoException.class);
        assertThatThrownBy(() -> fornecedorService.cadastrarParaUsuario(loja.admin(),
                request("Com marca alheia").marcaIds(marcaDaOutra.id()).build()))
                .isInstanceOf(FornecedorNaoEncontradoException.class)
                .hasMessage("Marca não encontrada.");
        assertThat(listar(loja, null, "todos").totalItens()).isZero();
        assertThat(fornecedorService.cadastrarParaUsuario(loja.admin(), request("Primeiro da loja").build()).numero())
                .isEqualTo(1L);
    }

    // ---------- Apoio ----------

    private record Loja(Empresa empresa, Long admin) {
    }

    private static ValidacaoDoFornecedorTest.RequestDeTeste request(String razaoSocial) {
        return ValidacaoDoFornecedorTest.request().razaoSocial(razaoSocial);
    }

    private PaginaResponse<FornecedorItemResponse> listar(Loja loja, String busca, String status) {
        return fornecedorService.listarParaUsuario(loja.admin(), busca, status, PAGINA, TAMANHO);
    }

    private static List<String> nomes(PaginaResponse<FornecedorItemResponse> pagina) {
        return pagina.itens().stream().map(FornecedorItemResponse::razaoSocial).toList();
    }

    private long contar(String tabela, Loja loja) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM " + tabela + " WHERE empresa_id = ?", Long.class,
                loja.empresa().getId());
    }

    private Long idInterno(UUID fornecedor) {
        return jdbcTemplate.queryForObject("SELECT id FROM fornecedores WHERE uuid = ?", Long.class, fornecedor);
    }

    /** Produto gravado direto no banco e ligado ao fornecedor (a ligacao pela API e da Task 5). */
    private void ligarAProduto(Loja loja, UUID fornecedor, String nome) {
        Long empresaId = loja.empresa().getId();
        Long produto = jdbcTemplate.queryForObject("""
                INSERT INTO produtos (empresa_id, numero, nome, preco_venda, unidade_id, busca_normalizada,
                                      nome_normalizado)
                VALUES (?, ?, ?, 10.00, (SELECT id FROM unidades_medida WHERE empresa_id = ? AND sigla = 'UN'),
                        lower(?), lower(?))
                RETURNING id
                """, Long.class, empresaId, SEQUENCIA.incrementAndGet(), nome, empresaId, nome, nome);
        jdbcTemplate.update("INSERT INTO produto_fornecedores (empresa_id, produto_id, fornecedor_id) VALUES (?, ?, ?)",
                empresaId, produto, idInterno(fornecedor));
    }

    /** Entrada por compra com o fornecedor, gravada direto no banco (o ajuste com fornecedor e da Task 5). */
    private void registrarEntrada(Loja loja, UUID fornecedor) {
        Long empresaId = loja.empresa().getId();
        Long produto = jdbcTemplate.queryForObject("""
                INSERT INTO produtos (empresa_id, numero, nome, preco_venda, unidade_id, busca_normalizada,
                                      nome_normalizado)
                VALUES (?, ?, 'Comprado', 10.00,
                        (SELECT id FROM unidades_medida WHERE empresa_id = ? AND sigla = 'UN'), 'comprado', 'comprado')
                RETURNING id
                """, Long.class, empresaId, SEQUENCIA.incrementAndGet(), empresaId);
        jdbcTemplate.update("""
                INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade, saldo_anterior,
                                                saldo_novo, usuario_id, custo_informado, custo_unitario, fornecedor_id)
                VALUES (?, ?, 'ENTRADA', 'COMPRA', 'AJUSTE_MANUAL', 5, 0, 5, ?, 10.00, 10.0000, ?)
                """, empresaId, produto, loja.admin(), idInterno(fornecedor));
    }

    /** Empresa FISICA com as unidades padrao e um ADMIN. */
    private Loja novaLoja() {
        String sufixo = String.valueOf(SEQUENCIA.incrementAndGet());
        String nome = "Empresa Fornecedores " + sufixo;
        Empresa empresa = new Empresa(nome);
        empresa.atualizarCadastro(nome, "1133224455", "contato" + sufixo + "@fornecedores.test", TipoPessoa.FISICA,
                null, null, null,
                new RepresentanteLegal("Representante " + sufixo, "11144477735", "11987654321",
                        "rep" + sufixo + "@fornecedores.test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        Empresa gravada = empresaRepository.saveAndFlush(empresa);
        Long admin = usuarioRepository.saveAndFlush(new Usuario(gravada, "Admin",
                "admin" + sufixo + "@fornecedores.test", "hash-irrelevante-no-teste", "ADMIN")).getId();
        unidadeService.criarPadroes(gravada);
        return new Loja(gravada, admin);
    }
}
