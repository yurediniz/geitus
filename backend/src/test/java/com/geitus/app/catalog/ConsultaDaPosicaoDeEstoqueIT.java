package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase.Replace;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaRepository;
import com.geitus.app.catalog.listagem.ConsultaDaPosicaoDeEstoque;
import com.geitus.app.catalog.listagem.FiltroDeProdutos;
import com.geitus.app.catalog.listagem.OrdemDaPosicao;
import com.geitus.app.catalog.listagem.PaginaDeIds;
import com.geitus.app.catalog.listagem.ResumoDaPosicao;
import com.geitus.app.catalog.listagem.SituacaoDaPosicao;
import com.geitus.app.catalog.listagem.StatusFiltro;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.catalog.unidade.UnidadeMedidaRepository;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.shared.busca.TextoDeBusca;

/**
 * {@link ConsultaDaPosicaoDeEstoque} contra um PostgreSQL real: so produtos que
 * controlam estoque, filtros de situacao, ordens e o resumo
 * (docs/modules/estoque.md, regras 22 a 24). Busca, categoria e status vem da
 * mesma montagem da listagem de produtos, coberta no {@code ConsultaDeProdutosIT};
 * aqui so se confere que se aplicam. O saldo e gravado direto em
 * {@code estoque_saldos}. Requer Docker.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Import(ConsultaDaPosicaoDeEstoque.class)
@Testcontainers
class ConsultaDaPosicaoDeEstoqueIT {

    private static final LocalDate HOJE = LocalDate.of(2026, 10, 27);
    private static final int TAMANHO_GRANDE = 100;

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
    private ConsultaDaPosicaoDeEstoque consulta;

    @Autowired
    private ProdutoRepository produtoRepository;

    @Autowired
    private EmpresaRepository empresaRepository;

    @Autowired
    private UnidadeMedidaRepository unidadeRepository;

    @Autowired
    private CategoriaRepository categoriaRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private Empresa empresa;
    private final Map<Long, UnidadeMedida> unidadePorEmpresa = new HashMap<>();
    private final Map<Long, String> nomePorId = new HashMap<>();

    @BeforeEach
    void criarEmpresa() {
        empresa = novaEmpresa("Empresa Posicao");
    }

    @Test
    void soProdutosQueControlamEstoque() {
        saldo(salvar(produto("Controla")), "3");
        saldo(salvar(produto("Nao controla").semControleDeEstoque()), "9");
        salvar(produto("Controla sem linha de saldo"));

        assertThat(nomes(Set.of(), OrdemDaPosicao.NOME)).containsExactly("Controla", "Controla sem linha de saldo");
    }

    /**
     * Cada filtro em SQL traz exatamente os produtos que {@link SituacaoEstoque#de}
     * classifica naquela situacao (os dois lados da regra 16 nao divergem), com
     * os limites iguais e os niveis ausentes; varias situacoes juntas trazem a uniao.
     */
    @Test
    void cadaFiltroCasaComASituacaoCalculadaEmJava() {
        Map<String, SituacaoEstoque> esperada = cenarioDasSeisSituacoes();

        for (SituacaoEstoque situacao : SituacaoEstoque.values()) {
            List<String> doJava = esperada.entrySet().stream().filter(item -> item.getValue() == situacao)
                    .map(Map.Entry::getKey).sorted().toList();
            assertThat(nomes(Set.of(SituacaoDaPosicao.valueOf(situacao.name())), OrdemDaPosicao.NOME))
                    .as("filtro %s", situacao).containsExactlyInAnyOrderElementsOf(doJava);
        }
        assertThat(nomes(Set.of(SituacaoDaPosicao.ZERADO, SituacaoDaPosicao.ALTO), OrdemDaPosicao.NOME))
                .containsExactlyInAnyOrderElementsOf(nasSituacoes(esperada,
                        Set.of(SituacaoEstoque.ZERADO, SituacaoEstoque.ALTO)));
        assertThat(nomes(Set.of(SituacaoDaPosicao.NEGATIVO, SituacaoDaPosicao.BAIXO, SituacaoDaPosicao.REPOSICAO),
                OrdemDaPosicao.NOME)).containsExactlyInAnyOrderElementsOf(nasSituacoes(esperada,
                        Set.of(SituacaoEstoque.NEGATIVO, SituacaoEstoque.BAIXO, SituacaoEstoque.REPOSICAO)));
        assertThat(nomes(Set.of(SituacaoDaPosicao.values()), OrdemDaPosicao.NOME))
                .containsExactlyInAnyOrderElementsOf(esperada.keySet());
    }

    private static List<String> nasSituacoes(Map<String, SituacaoEstoque> esperada, Set<SituacaoEstoque> situacoes) {
        return esperada.entrySet().stream().filter(item -> situacoes.contains(item.getValue()))
                .map(Map.Entry::getKey).sorted().toList();
    }

    @Test
    void ordemPorSaldoNasDuasDirecoes() {
        saldo(salvar(produto("Cinco")), "5");
        saldo(salvar(produto("Menos um")), "-1");
        salvar(produto("Zero"));

        assertThat(nomes(Set.of(), OrdemDaPosicao.SALDO)).containsExactly("Menos um", "Zero", "Cinco");
        assertThat(nomes(Set.of(), OrdemDaPosicao.SALDO_DESC)).containsExactly("Cinco", "Zero", "Menos um");
    }

    @Test
    void ordemPorValorDeixaOsSemValorSempreNoFim() {
        saldo(salvar(produto("Valor 20").custo("4.00")), "5");
        saldo(salvar(produto("Valor 30").custo("10.00")), "3");
        saldo(salvar(produto("Sem custo")), "7");
        saldo(salvar(produto("Negativo com custo").custo("2.00")), "-4");

        assertThat(nomes(Set.of(), OrdemDaPosicao.VALOR))
                .containsExactly("Valor 20", "Valor 30", "Negativo com custo", "Sem custo");
        assertThat(nomes(Set.of(), OrdemDaPosicao.VALOR_DESC))
                .containsExactly("Valor 30", "Valor 20", "Negativo com custo", "Sem custo");
    }

    @Test
    void buscaCategoriaEStatusDaListagemSeAplicam() {
        Categoria racao = categoriaRepository.saveAndFlush(new Categoria(empresa, null, "Ração"));
        salvar(produto("Ração Golden").categoria(racao));
        salvar(produto("Areia Golden"));
        salvar(produto("Ração Inativa").categoria(racao).inativo());

        assertThat(nomes(filtro("golden", StatusFiltro.ATIVOS, null), Set.of(), OrdemDaPosicao.NOME))
                .containsExactly("Areia Golden", "Ração Golden");
        assertThat(nomes(filtro(null, StatusFiltro.TODOS, Set.of(racao.getId())), Set.of(), OrdemDaPosicao.NOME))
                .containsExactly("Ração Golden", "Ração Inativa");
        assertThat(nomes(filtro(null, StatusFiltro.ATIVOS, Set.of()), Set.of(), OrdemDaPosicao.NOME)).isEmpty();
    }

    @Test
    void outraEmpresaNaoAparece() {
        Empresa outra = novaEmpresa("Outra Loja");
        saldo(salvar(produtoDa(outra, "Da outra")), "-5");
        saldo(salvar(produto("Daqui")), "1");

        assertThat(nomes(Set.of(), OrdemDaPosicao.NOME)).containsExactly("Daqui");
        assertThat(consulta.resumir(filtro(null, StatusFiltro.ATIVOS, null)).negativos()).isZero();
    }

    @Test
    void resumoContaCadaSituacaoUmaVezSo() {
        Map<String, SituacaoEstoque> esperada = cenarioDasSeisSituacoes();

        ResumoDaPosicao resumo = consulta.resumir(filtro(null, StatusFiltro.ATIVOS, null));

        assertThat(resumo.produtos()).isEqualTo(esperada.size());
        assertThat(resumo.negativos()).isEqualTo(contar(esperada, SituacaoEstoque.NEGATIVO));
        assertThat(resumo.zerados()).isEqualTo(contar(esperada, SituacaoEstoque.ZERADO));
        assertThat(resumo.baixo()).isEqualTo(contar(esperada, SituacaoEstoque.BAIXO));
        assertThat(resumo.reposicao()).isEqualTo(contar(esperada, SituacaoEstoque.REPOSICAO));
        assertThat(resumo.alto()).isEqualTo(contar(esperada, SituacaoEstoque.ALTO));
        assertThat(resumo.produtos() - resumo.negativos() - resumo.zerados() - resumo.baixo() - resumo.reposicao()
                - resumo.alto()).as("regulares").isEqualTo(contar(esperada, SituacaoEstoque.REGULAR));
    }

    @Test
    void resumoSomaValorArredondadoPorProduto() {
        saldo(salvar(produto("Negativo").custo("2.00")), "-2");
        salvar(produto("Zerado"));
        saldo(salvar(produto("Baixo").estoqueMinimo("10").custo("1.00")), "8");
        // 1,333 x 0,10 = 0,1333 -> 0,13 (cada produto a centavos antes de somar)
        saldo(salvar(produto("Fracao").custo("0.10")), "1.333");
        saldo(salvar(produto("Sem custo")), "4");
        saldo(salvar(produto("Nao controla").semControleDeEstoque().custo("100.00")), "50");

        ResumoDaPosicao resumo = consulta.resumir(filtro(null, StatusFiltro.ATIVOS, null));

        assertThat(resumo.produtos()).isEqualTo(5);
        assertThat(resumo.negativos()).isEqualTo(1);
        assertThat(resumo.zerados()).isEqualTo(1);
        assertThat(resumo.baixo()).isEqualTo(1);
        assertThat(resumo.valorTotalEmCusto()).isEqualByComparingTo("8.13");
        assertThat(resumo.valorTotalEmCusto().scale()).isEqualTo(2);
        assertThat(resumo.semCusto()).isEqualTo(1);
    }

    @Test
    void resumoSemProdutosVemZerado() {
        ResumoDaPosicao resumo = consulta.resumir(filtro(null, StatusFiltro.ATIVOS, null));

        assertThat(resumo).isEqualTo(new ResumoDaPosicao(0, 0, 0, 0, 0, 0, new BigDecimal("0.00"), 0));
    }

    /**
     * Produtos em todas as situacoes, com os tres niveis (minimo 2, ponto 5,
     * maximo 10), com um nivel so e sem niveis, incluindo os limites iguais. Cada
     * situacao esperada e conferida contra {@link SituacaoEstoque#de}.
     */
    private Map<String, SituacaoEstoque> cenarioDasSeisSituacoes() {
        Map<String, SituacaoEstoque> esperada = new HashMap<>();
        comNiveis(esperada, "Negativo", "-2", SituacaoEstoque.NEGATIVO);
        comNiveis(esperada, "Zerado", null, SituacaoEstoque.ZERADO);
        comNiveis(esperada, "Baixo no minimo", "2", SituacaoEstoque.BAIXO);
        comNiveis(esperada, "Reposicao no ponto", "5", SituacaoEstoque.REPOSICAO);
        comNiveis(esperada, "Regular no maximo", "10", SituacaoEstoque.REGULAR);
        comNiveis(esperada, "Alto", "10.001", SituacaoEstoque.ALTO);
        guardar(esperada, produto("So minimo").estoqueMinimo("2"), "1", SituacaoEstoque.BAIXO);
        guardar(esperada, produto("So ponto").pontoReposicao("5"), "3", SituacaoEstoque.REPOSICAO);
        guardar(esperada, produto("So maximo").estoqueMaximo("10"), "11", SituacaoEstoque.ALTO);
        guardar(esperada, produto("Minimo sem ponto acima").estoqueMinimo("2").estoqueMaximo("10"), "3",
                SituacaoEstoque.REGULAR);
        guardar(esperada, produto("Sem niveis"), "7", SituacaoEstoque.REGULAR);
        guardar(esperada, produto("Sem niveis zerado"), "0", SituacaoEstoque.ZERADO);
        return esperada;
    }

    private void comNiveis(Map<String, SituacaoEstoque> esperada, String nome, String saldo,
            SituacaoEstoque situacao) {
        guardar(esperada, produto(nome).estoqueMinimo("2").pontoReposicao("5").estoqueMaximo("10"), saldo, situacao);
    }

    /** Salva com o saldo ({@code null} = sem linha de saldo) e confere a situacao esperada contra o Java. */
    private void guardar(Map<String, SituacaoEstoque> esperada, ProdutoTesteBuilder builder, String saldo,
            SituacaoEstoque situacao) {
        Produto salvo = salvar(builder);
        if (saldo != null) {
            saldo(salvo, saldo);
        }
        BigDecimal atual = saldo == null ? BigDecimal.ZERO : new BigDecimal(saldo);
        assertThat(SituacaoEstoque.de(true, atual, salvo.getPontoReposicao(), salvo.getEstoqueMinimo(),
                salvo.getEstoqueMaximo())).as("situacao de %s em Java", salvo.getNome()).isEqualTo(situacao);
        esperada.put(salvo.getNome(), situacao);
    }

    private static long contar(Map<String, SituacaoEstoque> esperada, SituacaoEstoque situacao) {
        return esperada.values().stream().filter(situacao::equals).count();
    }

    @Test
    void paginaAlemDoFimTrazOTotal() {
        salvar(produto("A"));
        salvar(produto("B"));

        PaginaDeIds pagina = consulta.buscar(filtro(null, StatusFiltro.ATIVOS, null), Set.of(), OrdemDaPosicao.NOME,
                1, 2);

        assertThat(pagina.ids()).isEmpty();
        assertThat(pagina.total()).isEqualTo(2);
    }

    private List<String> nomes(Set<SituacaoDaPosicao> situacoes, OrdemDaPosicao ordem) {
        return nomes(filtro(null, StatusFiltro.ATIVOS, null), situacoes, ordem);
    }

    private List<String> nomes(FiltroDeProdutos filtro, Set<SituacaoDaPosicao> situacoes, OrdemDaPosicao ordem) {
        PaginaDeIds pagina = consulta.buscar(filtro, situacoes, ordem, 0, TAMANHO_GRANDE);
        assertThat(pagina.total()).as("total coerente com a pagina").isEqualTo(pagina.ids().size());
        return pagina.ids().stream().map(nomePorId::get).toList();
    }

    private FiltroDeProdutos filtro(String busca, StatusFiltro status, Set<Long> categorias) {
        return new FiltroDeProdutos(empresa.getId(), TextoDeBusca.palavras(busca), TextoDeBusca.termoDeCodigo(busca),
                TextoDeBusca.termoNumerico(busca), status, categorias, Set.of(), false, HOJE);
    }

    private ProdutoTesteBuilder produto(String nome) {
        return produtoDa(empresa, nome);
    }

    private ProdutoTesteBuilder produtoDa(Empresa dona, String nome) {
        return ProdutoTesteBuilder.produto(dona, unidadePorEmpresa.get(dona.getId())).nome(nome);
    }

    private Produto salvar(ProdutoTesteBuilder builder) {
        Produto salvo = produtoRepository.saveAndFlush(builder.build());
        nomePorId.put(salvo.getId(), salvo.getNome());
        return salvo;
    }

    private void saldo(Produto produto, String saldo) {
        jdbcTemplate.update("INSERT INTO estoque_saldos (empresa_id, produto_id, saldo) VALUES (?, ?, ?)",
                produto.getEmpresaId(), produto.getId(), new BigDecimal(saldo));
    }

    private Empresa novaEmpresa(String nome) {
        String slug = nome.toLowerCase().replaceAll("[^a-z0-9]", "");
        Empresa nova = new Empresa(nome);
        nova.atualizarCadastro(nome, "1133224455", "contato@" + slug + ".test", TipoPessoa.FISICA, null, null, null,
                new RepresentanteLegal("Representante " + nome, "11144477735", "11987654321", "rep@" + slug + ".test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        Empresa salva = empresaRepository.saveAndFlush(nova);
        unidadePorEmpresa.put(salva.getId(),
                unidadeRepository.saveAndFlush(new UnidadeMedida(salva, "UN", "Unidade", false)));
        return salva;
    }
}
