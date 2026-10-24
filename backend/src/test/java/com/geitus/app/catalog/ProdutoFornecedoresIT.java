package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.dto.FornecedorResumo;
import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.catalog.dto.ProdutoDoFornecedorResponse;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.listagem.ParametrosDaListagem;
import com.geitus.app.catalog.marca.MarcaService;
import com.geitus.app.catalog.marca.dto.MarcaRequest;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.supplier.DadosFornecedorInvalidosException;
import com.geitus.app.supplier.FornecedorNaoEncontradoException;
import com.geitus.app.supplier.FornecedorService;
import com.geitus.app.supplier.dto.FornecedorRequest;

import jakarta.persistence.EntityManagerFactory;

/**
 * Fornecedores no produto e produtos do fornecedor (Fase B5) com o contexto
 * Spring completo e um PostgreSQL real (Testcontainers, V14): a lista do
 * produto com o da ultima compra e a FK de tres colunas, as regras de
 * docs/modules/fornecedores-e-marcas.md, 5, a mesma lista vista pela tela do
 * fornecedor (4.4) e, em especial, a lista que perde o fornecedor da ultima
 * compra pelos dois lados sem nunca violar a FK (Review Focus 1).
 *
 * <p>Sem {@code @Transactional} na classe: cada chamada confirma a propria
 * transacao, como em producao. Cada teste usa uma empresa nova. Requer Docker.
 */
@SpringBootTest
@Testcontainers
class ProdutoFornecedoresIT {

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
        registry.add("spring.jpa.properties.hibernate.generate_statistics", () -> "true");
    }

    @Autowired
    private EmpresaRepository empresaRepository;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private UnidadeMedidaService unidadeService;

    @Autowired
    private ProdutoService produtoService;

    @Autowired
    private FornecedorService fornecedorService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private MarcaService marcaService;

    // ---------- No produto (spec 5) ----------

    @Test
    void cadastroComAListaEOUltimoOrdenadosPorNome() {
        Loja loja = novaLoja();
        UUID zebra = fornecedor(loja, "Zebra Distribuidora");
        UUID atacado = fornecedor(loja, "Atacado Sul");

        ProdutoResponse produto = cadastrar(loja, "Ração", List.of(zebra, atacado), zebra);

        assertThat(produto.fornecedores()).extracting(FornecedorResumo::nome)
                .containsExactly("Atacado Sul", "Zebra Distribuidora");
        assertThat(produto.fornecedores()).allSatisfy(fornecedor -> assertThat(fornecedor.ativo()).isTrue());
        assertThat(produto.fornecedorUltimaCompra().id()).isEqualTo(zebra);
        assertThat(produto.fornecedorUltimaCompra().numero()).isEqualTo(1L);
        ProdutoResponse relido = produtoService.buscarPorIdParaUsuario(loja.admin(), produto.id());
        assertThat(relido.fornecedores()).extracting(FornecedorResumo::id).containsExactly(atacado, zebra);
        assertThat(relido.fornecedorUltimaCompra().nome()).isEqualTo("Zebra Distribuidora");
    }

    @Test
    void ultimoForaDaListaE400() {
        Loja loja = novaLoja();
        UUID atacado = fornecedor(loja, "Atacado Sul");
        UUID zebra = fornecedor(loja, "Zebra");

        assertThatThrownBy(() -> cadastrar(loja, "Ração", List.of(atacado), zebra))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("O fornecedor da última compra precisa estar na lista de fornecedores.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo())
                        .contains("fornecedorUltimaCompraId"));
        assertThatThrownBy(() -> cadastrar(loja, "Ração", null, zebra))
                .isInstanceOf(RegraDeNegocioException.class);
    }

    @Test
    void fornecedorDeOutraEmpresaE404() {
        Loja loja = novaLoja();
        UUID daOutra = fornecedor(novaLoja(), "Da outra");

        assertThatThrownBy(() -> cadastrar(loja, "Ração", List.of(daOutra), null))
                .isInstanceOf(CatalogoNaoEncontradoException.class)
                .hasMessage("Fornecedor não encontrado.");
    }

    @Test
    void inativoNovoE400EOJaLigadoContinua() {
        Loja loja = novaLoja();
        UUID atacado = fornecedor(loja, "Atacado Sul");
        UUID zebra = fornecedor(loja, "Zebra");
        ProdutoResponse produto = cadastrar(loja, "Ração", List.of(atacado), atacado);
        fornecedorService.inativarParaUsuario(loja.admin(), atacado);
        fornecedorService.inativarParaUsuario(loja.admin(), zebra);

        ProdutoResponse mantido = atualizar(loja, produto.id(), List.of(atacado), atacado);

        assertThat(mantido.fornecedores()).singleElement().satisfies(fornecedor -> assertThat(fornecedor.ativo())
                .isFalse());
        assertThatThrownBy(() -> atualizar(loja, produto.id(), List.of(atacado, zebra), atacado))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Este fornecedor está inativo.");
    }

    @Test
    void noMaximoVinteFornecedoresERepetidoContaUmaVez() {
        Loja loja = novaLoja();
        List<UUID> vinteEUm = IntStream.rangeClosed(1, 21).mapToObj(numero -> fornecedor(loja, "F" + numero))
                .toList();

        assertThatThrownBy(() -> cadastrar(loja, "Ração", vinteEUm, null))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Informe no máximo 20 fornecedores.");
        ProdutoResponse comRepetido = cadastrar(loja, "Ração", List.of(vinteEUm.get(0), vinteEUm.get(0)), null);
        assertThat(comRepetido.fornecedores()).hasSize(1);
    }

    @Test
    void patchSemAListaMantemAListaEOUltimo() {
        Loja loja = novaLoja();
        UUID atacado = fornecedor(loja, "Atacado Sul");
        ProdutoResponse produto = cadastrar(loja, "Ração", List.of(atacado), atacado);

        ProdutoResponse editado = produtoService.atualizarDadosBasicosParaUsuario(loja.admin(), produto.id(),
                ProdutoRequestBuilder.comUnidade(loja.un()).nome("Ração Nova").build());

        assertThat(editado.nome()).isEqualTo("Ração Nova");
        assertThat(editado.fornecedores()).extracting(FornecedorResumo::id).containsExactly(atacado);
        assertThat(editado.fornecedorUltimaCompra().id()).isEqualTo(atacado);
    }

    /** Review Focus 1, pelo produto: tirar da lista o da ultima compra limpa o campo antes, sem 500. */
    @Test
    void tirarDaListaODaUltimaCompraLimpaOCampo() {
        Loja loja = novaLoja();
        UUID atacado = fornecedor(loja, "Atacado Sul");
        UUID zebra = fornecedor(loja, "Zebra");
        UUID novo = fornecedor(loja, "Novo");
        ProdutoResponse produto = cadastrar(loja, "Ração", List.of(atacado, zebra), atacado);

        ProdutoResponse semOUltimo = atualizar(loja, produto.id(), List.of(zebra), null);
        assertThat(semOUltimo.fornecedores()).extracting(FornecedorResumo::id).containsExactly(zebra);
        assertThat(semOUltimo.fornecedorUltimaCompra()).isNull();

        atualizar(loja, produto.id(), List.of(zebra), zebra);
        ProdutoResponse trocado = atualizar(loja, produto.id(), List.of(novo), novo);
        assertThat(trocado.fornecedores()).extracting(FornecedorResumo::id).containsExactly(novo);
        assertThat(trocado.fornecedorUltimaCompra().id()).isEqualTo(novo);
        assertThat(ligacoes(produto.id())).isEqualTo(1);

        ProdutoResponse vazio = atualizar(loja, produto.id(), List.of(), null);
        assertThat(vazio.fornecedores()).isEmpty();
        assertThat(ligacoes(produto.id())).isZero();
    }

    @Test
    void produtoComOUltimoFornecedorEExcluido() {
        Loja loja = novaLoja();
        UUID atacado = fornecedor(loja, "Atacado Sul");
        ProdutoResponse produto = cadastrar(loja, "Ração", List.of(atacado), atacado);

        assertThatCode(() -> produtoService.excluirParaUsuario(loja.admin(), produto.id()))
                .doesNotThrowAnyException();
        assertThat(ligacoes(produto.id())).isZero();
        assertThat(fornecedorService.buscarParaUsuario(loja.admin(), atacado).quantidadeProdutos()).isZero();
    }

    @Test
    void listagemTrazOsFornecedoresDeCadaProduto() {
        Loja loja = novaLoja();
        UUID atacado = fornecedor(loja, "Atacado Sul");
        UUID zebra = fornecedor(loja, "Zebra");
        cadastrar(loja, "Arroz", List.of(atacado, zebra), zebra);
        cadastrar(loja, "Feijão", List.of(zebra), null);
        cadastrar(loja, "Sal", null, null);

        PaginaResponse<ProdutoResponse> pagina = produtoService.listarParaUsuario(loja.admin(),
                ParametrosDaListagem.daRequisicao(null, null, null, null, null, null, 0, 25));

        assertThat(pagina.itens()).extracting(ProdutoResponse::nome).containsExactly("Arroz", "Feijão", "Sal");
        assertThat(pagina.itens().get(0).fornecedores()).extracting(FornecedorResumo::nome)
                .containsExactly("Atacado Sul", "Zebra");
        assertThat(pagina.itens().get(0).fornecedorUltimaCompra().nome()).isEqualTo("Zebra");
        assertThat(pagina.itens().get(1).fornecedores()).extracting(FornecedorResumo::nome).containsExactly("Zebra");
        assertThat(pagina.itens().get(2).fornecedores()).isEmpty();
    }

    // ---------- Pelo fornecedor (spec 4.4) ----------

    @Test
    void ligarDuasVezesFicaUmaLigacaoSo() {
        Loja loja = novaLoja();
        UUID atacado = fornecedor(loja, "Atacado Sul");
        ProdutoResponse produto = cadastrar(loja, "Ração", null, null);

        LigacaoDoProduto primeira = fornecedorService.ligarProdutoParaUsuario(loja.admin(), atacado, produto.id());
        LigacaoDoProduto segunda = fornecedorService.ligarProdutoParaUsuario(loja.admin(), atacado, produto.id());

        assertThat(primeira.criada()).isTrue();
        assertThat(segunda.criada()).isFalse();
        assertThat(ligacoes(produto.id())).isEqualTo(1);
        assertThat(produtoService.buscarPorIdParaUsuario(loja.admin(), produto.id()).fornecedores())
                .extracting(FornecedorResumo::id).containsExactly(atacado);
    }

    /** Review Focus 1, pelo fornecedor: remover o da ultima compra limpa o campo do produto. */
    @Test
    void desligarODaUltimaCompraLimpaOCampoDoProduto() {
        Loja loja = novaLoja();
        UUID atacado = fornecedor(loja, "Atacado Sul");
        UUID zebra = fornecedor(loja, "Zebra");
        ProdutoResponse produto = cadastrar(loja, "Ração", List.of(atacado, zebra), atacado);

        PaginaResponse<ProdutoDoFornecedorResponse> antes = fornecedorService.produtosParaUsuario(loja.admin(),
                atacado, 0, 25);
        assertThat(antes.itens()).singleElement()
                .satisfies(item -> assertThat(item.fornecedorDaUltimaCompra()).isTrue());

        fornecedorService.desligarProdutoParaUsuario(loja.admin(), atacado, produto.id());

        ProdutoResponse depois = produtoService.buscarPorIdParaUsuario(loja.admin(), produto.id());
        assertThat(depois.fornecedorUltimaCompra()).isNull();
        assertThat(depois.fornecedores()).extracting(FornecedorResumo::id).containsExactly(zebra);
        assertThat(fornecedorService.produtosParaUsuario(loja.admin(), atacado, 0, 25).totalItens()).isZero();
        assertThatThrownBy(() -> fornecedorService.desligarProdutoParaUsuario(loja.admin(), atacado, produto.id()))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
    }

    @Test
    void produtoDeOutraEmpresaEFornecedorInativoNaoGanhamLigacao() {
        Loja loja = novaLoja();
        UUID atacado = fornecedor(loja, "Atacado Sul");
        ProdutoResponse daOutra = cadastrar(novaLoja(), "Da outra", null, null);
        ProdutoResponse produto = cadastrar(loja, "Ração", null, null);
        assertThatThrownBy(() -> fornecedorService.ligarProdutoParaUsuario(loja.admin(), atacado, daOutra.id()))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
        fornecedorService.inativarParaUsuario(loja.admin(), atacado);

        assertThatThrownBy(() -> fornecedorService.ligarProdutoParaUsuario(loja.admin(), atacado, produto.id()))
                .isInstanceOf(DadosFornecedorInvalidosException.class)
                .hasMessage("Este fornecedor está inativo.");
        assertThat(ligacoes(produto.id())).isZero();
    }

    /** Decisao do CTO: a tela do fornecedor nao passa do limite de 20 fornecedores do produto. */
    @Test
    void ligarNumProdutoComVinteFornecedoresE400EOJaLigadoContinua() {
        Loja loja = novaLoja();
        List<UUID> vinte = IntStream.rangeClosed(1, 20).mapToObj(numero -> fornecedor(loja, "F" + numero)).toList();
        UUID vigesimoPrimeiro = fornecedor(loja, "F21");
        ProdutoResponse produto = cadastrar(loja, "Ração", vinte, null);

        assertThatThrownBy(() -> fornecedorService.ligarProdutoParaUsuario(loja.admin(), vigesimoPrimeiro,
                produto.id()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Este produto já tem 20 fornecedores. Tire um da lista do produto para ligar outro.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains("produtoId"));
        assertThat(fornecedorService.ligarProdutoParaUsuario(loja.admin(), vinte.get(0), produto.id()).criada())
                .isFalse();
        assertThat(ligacoes(produto.id())).isEqualTo(20);
    }

    @Test
    void ultimaCompraSemAListaE400NoCadastroENoPatch() {
        Loja loja = novaLoja();
        UUID atacado = fornecedor(loja, "Atacado Sul");
        ProdutoResponse produto = cadastrar(loja, "Ração", List.of(atacado), null);

        assertThatThrownBy(() -> cadastrar(loja, "Feijão", null, atacado))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Informe a lista de fornecedores.");
        assertThatThrownBy(() -> atualizar(loja, produto.id(), null, atacado))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Informe a lista de fornecedores.")
                .satisfies(erro -> assertThat(((RegraDeNegocioException) erro).campo()).contains("fornecedorIds"));
        assertThat(produtoService.buscarPorIdParaUsuario(loja.admin(), produto.id()).fornecedorUltimaCompra())
                .isNull();
    }

    /** Sem N+1: a listagem com marca e dois fornecedores em cada produto faz os mesmos comandos com 3 ou 25. */
    @Test
    void listagemComMarcaEFornecedoresNaoDependeDoTamanhoDaPagina() {
        Loja loja = novaLoja();
        UUID marca = marcaService.cadastrarParaUsuario(loja.admin(), new MarcaRequest("Golden", null)).id();
        UUID atacado = fornecedor(loja, "Atacado Sul");
        UUID zebra = fornecedor(loja, "Zebra");
        for (int numero = 1; numero <= 30; numero++) {
            produtoService.cadastrarParaUsuario(loja.admin(), ProdutoRequestBuilder.comUnidade(loja.un())
                    .nome("Produto " + numero).marcaId(marca).fornecedorIds(List.of(atacado, zebra))
                    .fornecedorUltimaCompraId(zebra).build());
        }

        long comTres = comandosDaListagem(loja, 3);
        long comVinteECinco = comandosDaListagem(loja, 25);

        assertThat(comVinteECinco).isEqualTo(comTres);
    }

    @Test
    void produtosEDesligarComFornecedorDeOutraEmpresaE404() {
        Loja loja = novaLoja();
        Loja outra = novaLoja();
        UUID daOutra = fornecedor(outra, "Da outra");
        ProdutoResponse produtoDaOutra = cadastrar(outra, "Ração", List.of(daOutra), daOutra);

        assertThatThrownBy(() -> fornecedorService.produtosParaUsuario(loja.admin(), daOutra, 0, 25))
                .isInstanceOf(FornecedorNaoEncontradoException.class)
                .hasMessage("Fornecedor não encontrado.");
        assertThatThrownBy(() -> fornecedorService.desligarProdutoParaUsuario(loja.admin(), daOutra,
                produtoDaOutra.id()))
                .isInstanceOf(FornecedorNaoEncontradoException.class);
        assertThat(ligacoes(produtoDaOutra.id())).isEqualTo(1);
    }

    @Test
    void paginaDosProdutosDoFornecedorPorNome() {
        Loja loja = novaLoja();
        UUID atacado = fornecedor(loja, "Atacado Sul");
        cadastrar(loja, "Feijão", List.of(atacado), null);
        cadastrar(loja, "Arroz", List.of(atacado), atacado);
        cadastrar(loja, "Sal", null, null);

        PaginaResponse<ProdutoDoFornecedorResponse> pagina = fornecedorService.produtosParaUsuario(loja.admin(),
                atacado, 0, 25);

        assertThat(pagina.itens()).extracting(ProdutoDoFornecedorResponse::nome).containsExactly("Arroz", "Feijão");
        assertThat(pagina.itens()).extracting(ProdutoDoFornecedorResponse::fornecedorDaUltimaCompra)
                .containsExactly(true, false);
        assertThat(pagina.itens().get(0).numero()).isNotNull();
    }

    // ---------- Apoio ----------

    private record Loja(Empresa empresa, Long admin, UUID un) {
    }

    private UUID fornecedor(Loja loja, String nome) {
        return fornecedorService.cadastrarParaUsuario(loja.admin(), new FornecedorRequest(null, null, nome, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null)).id();
    }

    private ProdutoResponse cadastrar(Loja loja, String nome, List<UUID> fornecedores, UUID ultimaCompra) {
        return produtoService.cadastrarParaUsuario(loja.admin(), ProdutoRequestBuilder.comUnidade(loja.un())
                .nome(nome).fornecedorIds(fornecedores).fornecedorUltimaCompraId(ultimaCompra).build());
    }

    private ProdutoResponse atualizar(Loja loja, UUID produto, List<UUID> fornecedores, UUID ultimaCompra) {
        return produtoService.atualizarDadosBasicosParaUsuario(loja.admin(), produto,
                ProdutoRequestBuilder.comUnidade(loja.un()).nome("Ração").fornecedorIds(fornecedores)
                        .fornecedorUltimaCompraId(ultimaCompra).build());
    }

    private long comandosDaListagem(Loja loja, int tamanho) {
        Statistics estatisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        estatisticas.clear();
        List<ProdutoResponse> itens = produtoService.listarParaUsuario(loja.admin(),
                ParametrosDaListagem.daRequisicao(null, null, null, null, null, null, 0, tamanho)).itens();
        assertThat(itens).hasSize(tamanho).allSatisfy(item -> {
            assertThat(item.marca().nome()).isEqualTo("Golden");
            assertThat(item.fornecedores()).hasSize(2);
            assertThat(item.fornecedorUltimaCompra().nome()).isEqualTo("Zebra");
        });
        return estatisticas.getPrepareStatementCount();
    }

    private long ligacoes(UUID produto) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM produto_fornecedores pf JOIN produtos p"
                + " ON p.id = pf.produto_id WHERE p.uuid = ?", Long.class, produto);
    }

    /** Empresa FISICA com as unidades padrao e um ADMIN. */
    private Loja novaLoja() {
        String sufixo = String.valueOf(SEQUENCIA.incrementAndGet());
        String nome = "Empresa Produto Fornecedores " + sufixo;
        Empresa empresa = new Empresa(nome);
        empresa.atualizarCadastro(nome, "1133224455", "contato" + sufixo + "@pf.test", TipoPessoa.FISICA,
                null, null, null,
                new RepresentanteLegal("Representante " + sufixo, "11144477735", "11987654321",
                        "rep" + sufixo + "@pf.test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        Empresa gravada = empresaRepository.saveAndFlush(empresa);
        Long admin = usuarioRepository.saveAndFlush(new Usuario(gravada, "Admin",
                "admin" + sufixo + "@pf.test", "hash-irrelevante-no-teste", "ADMIN")).getId();
        unidadeService.criarPadroes(gravada);
        UUID un = unidadeService.listarParaUsuario(admin, null).stream()
                .filter(unidade -> unidade.sigla().equals("UN"))
                .map(UnidadeMedidaResponse::id)
                .findFirst()
                .orElseThrow();
        return new Loja(gravada, admin, un);
    }
}
