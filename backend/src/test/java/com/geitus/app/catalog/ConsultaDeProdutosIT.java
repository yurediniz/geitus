package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
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
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.categoria.CategoriaRepository;
import com.geitus.app.catalog.listagem.ConsultaDeProdutos;
import com.geitus.app.catalog.listagem.EstoqueFiltro;
import com.geitus.app.catalog.listagem.FiltroDeProdutos;
import com.geitus.app.catalog.listagem.OrdemDeProdutos;
import com.geitus.app.catalog.listagem.PaginaDeIds;
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
 * {@link ConsultaDeProdutos} contra um PostgreSQL real (Testcontainers, V1-V10):
 * a etapa 1 da listagem (ids da pagina e total) com a busca sem acento, cada
 * filtro, cada ordem e a paginacao (docs/modules/produtos-listagem.md, 4 e 5).
 *
 * <p>Fica no pacote {@code catalog} para montar os produtos com o
 * {@link ProdutoTesteBuilder}. O saldo de estoque e gravado direto em
 * {@code estoque_saldos} (a consulta so le o saldo). Cada teste roda numa
 * transacao desfeita no fim ({@code @DataJpaTest}). Requer Docker.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Import(ConsultaDeProdutos.class)
@Testcontainers
class ConsultaDeProdutosIT {

    private static final LocalDate HOJE = LocalDate.of(2026, 10, 23);
    private static final int TAMANHO_GRANDE = 100;
    private static final String EAN13 = "7891000315507";

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
    private ConsultaDeProdutos consulta;

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
        empresa = novaEmpresa("Empresa Lista");
    }

    // ---------- Busca (spec 4.1) ----------

    @Test
    void buscaSemAcento() {
        salvar(produto("Açúcar Cristal União"));
        salvar(produto("Arroz"));

        assertThat(nomes(filtro().busca("acucar"))).containsExactly("Açúcar Cristal União");
        assertThat(nomes(filtro().busca("AÇUCAR"))).containsExactly("Açúcar Cristal União");
    }

    @Test
    void buscaPorPalavrasEmQualquerOrdem() {
        salvar(produto("Açúcar Cristal União"));
        salvar(produto("Açúcar Refinado"));

        assertThat(nomes(filtro().busca("uniao acucar"))).containsExactly("Açúcar Cristal União");
        assertThat(nomes(filtro().busca("acucar"))).containsExactly("Açúcar Cristal União", "Açúcar Refinado");
        assertThat(nomes(filtro().busca("uniao arroz"))).isEmpty();
    }

    @Test
    void buscaPorMarcaNomeCurtoESku() {
        salvar(produto("Ração Adulto").marca("Golden"));
        salvar(produto("Sachê Gatos").nomeCurto("SACHE WHK").sku("DEMO-PET-003"));
        salvar(produto("Outro"));

        assertThat(nomes(filtro().busca("golden"))).containsExactly("Ração Adulto");
        assertThat(nomes(filtro().busca("whk"))).containsExactly("Sachê Gatos");
        assertThat(nomes(filtro().busca("pet-003"))).containsExactly("Sachê Gatos");
    }

    @Test
    void buscaPorParteDoCodigo() {
        salvar(produto("Feijão").codigo("96385074").codigo(EAN13));
        salvar(produto("Arroz").codigo("XYZ-778899"));

        assertThat(nomes(filtro().busca("1000315"))).containsExactly("Feijão");
        assertThat(nomes(filtro().busca(" 7891 0003 "))).containsExactly("Feijão");
        assertThat(nomes(filtro().busca("xyz-7788"))).containsExactly("Arroz");
    }

    @Test
    void buscaComCuringasLiterais() {
        salvar(produto("Desconto 50% algodão"));
        salvar(produto("Camiseta 50 algodão"));
        salvar(produto("Cabo_USB"));
        salvar(produto("CaboXUSB").codigo("ABC%1"));

        assertThat(nomes(filtro().busca("50%"))).containsExactly("Desconto 50% algodão");
        assertThat(nomes(filtro().busca("o_u"))).containsExactly("Cabo_USB");
        assertThat(nomes(filtro().busca("c%1"))).containsExactly("CaboXUSB");
        assertThat(nomes(filtro().busca("%"))).containsExactly("CaboXUSB", "Desconto 50% algodão");
    }

    @Test
    void buscaSoComMarcaCombinanteUsaSoOCodigo() {
        salvar(produto("Produto 1000315"));
        salvar(produto("Feijão").codigo(EAN13));

        PaginaDeIds soMarca = buscar(filtro().busca("\u0301"), OrdemDeProdutos.NOME, 0, TAMANHO_GRANDE);

        assertThat(soMarca.ids()).isEmpty();
        assertThat(soMarca.total()).isZero();
        assertThat(nomes(filtro().soCodigo("1000315"))).containsExactly("Feijão");
    }

    @Test
    void buscaComBarraInvertidaELiteral() {
        salvar(produto("Pasta C:\\temp"));
        salvar(produto("Pasta Ctemp"));

        assertThat(nomes(filtro().busca("c:\\t"))).containsExactly("Pasta C:\\temp");
        assertThat(nomes(filtro().busca("\\"))).containsExactly("Pasta C:\\temp");
    }

    @Test
    void buscaComApostrofo() {
        salvar(produto("Calça Levi's"));
        salvar(produto("Calça Lee"));

        assertThat(nomes(filtro().busca("levi's"))).containsExactly("Calça Levi's");
    }

    @Test
    void buscaComSeisPalavrasIgnoraASexta() {
        salvar(produto("Açúcar Cristal União 1kg Pacote"));
        salvar(produto("Açúcar Cristal União 5kg"));

        assertThat(nomes(filtro().busca("acucar cristal uniao 1kg pacote inexistente")))
                .containsExactly("Açúcar Cristal União 1kg Pacote");
    }

    @Test
    void buscaCasaPorTextoOuPorCodigo() {
        salvar(produto("Kit 7891"));
        salvar(produto("Feijão").codigo(EAN13));
        salvar(produto("Arroz").codigo("96385074"));

        assertThat(nomes(filtro().busca("7891"))).containsExactly("Feijão", "Kit 7891");
    }

    // ---------- Status ----------

    @Test
    void statusAtivosPadrao() {
        doisAtivosEUmInativo();

        assertThat(nomes(filtro())).containsExactly("Ativo 1", "Ativo 2");
    }

    @Test
    void statusInativos() {
        doisAtivosEUmInativo();

        assertThat(nomes(filtro().status(StatusFiltro.INATIVOS))).containsExactly("Inativo");
    }

    @Test
    void statusTodos() {
        doisAtivosEUmInativo();

        assertThat(nomes(filtro().status(StatusFiltro.TODOS))).containsExactly("Ativo 1", "Ativo 2", "Inativo");
    }

    // ---------- Categoria ----------

    @Test
    void categoriaIncluiDescendentes() {
        Categoria racao = categoria(null, "Ração");
        Categoria umida = categoria(racao, "Úmida");
        Categoria sache = categoria(umida, "Sachê");
        Categoria bebidas = categoria(null, "Bebidas");
        salvar(produto("Na raiz").categoria(racao));
        salvar(produto("Na filha").categoria(umida));
        salvar(produto("Na neta").categoria(sache));
        salvar(produto("Em outra").categoria(bebidas));
        salvar(produto("Sem categoria"));
        CategoriaArvore arvore = CategoriaArvore.de(List.of(racao, umida, sache, bebidas));

        assertThat(nomes(filtro().categorias(arvore.idsDaSubarvore(racao.getId()))))
                .containsExactly("Na filha", "Na neta", "Na raiz");
        assertThat(nomes(filtro().categorias(arvore.idsDaSubarvore(umida.getId()))))
                .containsExactly("Na filha", "Na neta");
    }

    @Test
    void conjuntoVazioDeCategoriasRetornaNada() {
        salvar(produto("Sem categoria"));

        PaginaDeIds pagina = buscar(filtro().categorias(Set.of()), OrdemDeProdutos.NOME, 0, TAMANHO_GRANDE);

        assertThat(pagina.ids()).isEmpty();
        assertThat(pagina.total()).isZero();
    }

    // ---------- Estoque (spec 4.2) ----------

    @Test
    void estoqueSem() {
        salvar(produto("Sem linha de saldo"));
        saldo(salvar(produto("Saldo zero")), "0");
        saldo(salvar(produto("Com saldo")), "5");
        salvar(produto("Nao controla").semControleDeEstoque());

        assertThat(nomes(filtro().estoque(EstoqueFiltro.SEM))).containsExactly("Saldo zero", "Sem linha de saldo");
    }

    @Test
    void estoqueBaixoPeloPonto() {
        saldo(salvar(produto("No ponto").pontoReposicao("10").estoqueMinimo("5")), "10");
        saldo(salvar(produto("Abaixo do ponto").pontoReposicao("10").estoqueMinimo("5")), "8");
        saldo(salvar(produto("Acima do ponto").pontoReposicao("10").estoqueMinimo("5")), "10.001");

        assertThat(nomes(filtro().estoque(EstoqueFiltro.BAIXO))).containsExactly("Abaixo do ponto", "No ponto");
    }

    @Test
    void estoqueBaixoPeloMinimoSemPonto() {
        saldo(salvar(produto("No minimo").estoqueMinimo("5")), "5");
        saldo(salvar(produto("Acima do minimo").estoqueMinimo("5")), "6");

        assertThat(nomes(filtro().estoque(EstoqueFiltro.BAIXO))).containsExactly("No minimo");
    }

    @Test
    void estoqueBaixoIncluiZerados() {
        salvar(produto("Zerado sem niveis"));
        saldo(salvar(produto("Zerado com ponto").pontoReposicao("10")), "0");
        saldo(salvar(produto("Com saldo sem niveis")), "3");

        assertThat(nomes(filtro().estoque(EstoqueFiltro.BAIXO))).containsExactly("Zerado com ponto",
                "Zerado sem niveis");
    }

    @Test
    void estoqueIgnoraQuemNaoControla() {
        saldo(salvar(produto("Nao controla zerado").pontoReposicao("10").semControleDeEstoque()), "0");
        saldo(salvar(produto("Nao controla baixo").pontoReposicao("10").semControleDeEstoque()), "2");

        assertThat(nomes(filtro().estoque(EstoqueFiltro.BAIXO))).isEmpty();
        assertThat(nomes(filtro().estoque(EstoqueFiltro.SEM))).isEmpty();
    }

    // ---------- Promocao ----------

    @Test
    void promocaoVigenteNosLimites() {
        salvar(produto("Comeca hoje").promocao("8.00", HOJE, HOJE.plusDays(5)));
        salvar(produto("Termina hoje").promocao("8.00", HOJE.minusDays(5), HOJE));
        salvar(produto("Comeca amanha").promocao("8.00", HOJE.plusDays(1), HOJE.plusDays(5)));
        salvar(produto("Terminou ontem").promocao("8.00", HOJE.minusDays(5), HOJE.minusDays(1)));
        salvar(produto("Sem promocao"));

        assertThat(nomes(filtro().emPromocao())).containsExactly("Comeca hoje", "Termina hoje");
    }

    // ---------- Combinacao ----------

    @Test
    void filtrosCombinados() {
        Categoria racao = categoria(null, "Ração");
        salvar(produto("Ração Golden promo zerada").categoria(racao).promocao("8.00", HOJE, HOJE));
        salvar(produto("Ração Golden promo zerada inativa").categoria(racao).promocao("8.00", HOJE, HOJE)
                .inativo());
        saldo(salvar(produto("Ração Golden promo com saldo").categoria(racao).promocao("8.00", HOJE, HOJE)), "9");
        salvar(produto("Ração Golden sem promo zerada").categoria(racao));
        salvar(produto("Golden fora da categoria promo zerada").promocao("8.00", HOJE, HOJE));
        salvar(produto("Ração Premier promo zerada").categoria(racao).promocao("8.00", HOJE, HOJE));

        Filtro todos = filtro().busca("golden racao").categorias(Set.of(racao.getId())).estoque(EstoqueFiltro.SEM)
                .emPromocao();

        assertThat(nomes(todos)).containsExactly("Ração Golden promo zerada");
    }

    // ---------- Ordem (spec 4.3) ----------

    @Test
    void ordemPorNomeIgnoraAcentoEMaiusculas() {
        salvar(produto("azeite"));
        salvar(produto("Água"));
        salvar(produto("Abacaxi"));

        assertThat(nomes(filtro(), OrdemDeProdutos.NOME)).containsExactly("Abacaxi", "Água", "azeite");
        assertThat(nomes(filtro(), OrdemDeProdutos.NOME_DESC)).containsExactly("azeite", "Água", "Abacaxi");
    }

    /** Collation "C" (V10): o espaco vem antes do hifen, em qualquer ambiente. */
    @Test
    void ordemPorNomeComEspacoEPontuacao() {
        salvar(produto("Arroz-doce"));
        salvar(produto("Arroz integral"));

        assertThat(nomes(filtro(), OrdemDeProdutos.NOME)).containsExactly("Arroz integral", "Arroz-doce");
        assertThat(nomes(filtro(), OrdemDeProdutos.NOME_DESC)).containsExactly("Arroz-doce", "Arroz integral");
    }

    /** Nomes que normalizam igual ("Água", "agua", "ÁGUA") desempatam pelo id, nas duas direcoes. */
    @Test
    void nomeNormalizadoIgualDesempataPeloId() {
        List<Long> idsNaOrdemDeCadastro = List.of(salvar(produto("Água")).getId(), salvar(produto("agua")).getId(),
                salvar(produto("ÁGUA")).getId());

        assertThat(buscar(filtro(), OrdemDeProdutos.NOME, 0, TAMANHO_GRANDE).ids())
                .containsExactlyElementsOf(idsNaOrdemDeCadastro);
        assertThat(buscar(filtro(), OrdemDeProdutos.NOME_DESC, 0, TAMANHO_GRANDE).ids())
                .containsExactlyElementsOf(idsNaOrdemDeCadastro);
    }

    @Test
    void ordemPorPreco() {
        salvar(produto("Medio").precoVenda("10.00"));
        salvar(produto("Caro").precoVenda("20.00"));
        salvar(produto("Barato").precoVenda("5.00"));

        assertThat(nomes(filtro(), OrdemDeProdutos.PRECO)).containsExactly("Barato", "Medio", "Caro");
        assertThat(nomes(filtro(), OrdemDeProdutos.PRECO_DESC)).containsExactly("Caro", "Medio", "Barato");
    }

    @Test
    void margemSemCustoSempreNoFim() {
        salvar(produto("Margem 50").precoVenda("10.00").custo("5.00"));
        salvar(produto("Margem 10").precoVenda("20.00").custo("18.00"));
        salvar(produto("Margem 80").precoVenda("10.00").custo("2.00"));
        salvar(produto("Sem custo B").precoVenda("10.00"));
        salvar(produto("Preco zero").precoVenda("0.00").custo("0.00"));
        salvar(produto("Sem custo A").precoVenda("3.00"));

        assertThat(nomes(filtro(), OrdemDeProdutos.MARGEM))
                .containsExactly("Margem 10", "Margem 50", "Margem 80", "Preco zero", "Sem custo A", "Sem custo B");
        assertThat(nomes(filtro(), OrdemDeProdutos.MARGEM_DESC))
                .containsExactly("Margem 80", "Margem 50", "Margem 10", "Preco zero", "Sem custo A", "Sem custo B");
    }

    /** Custo zero (margem 100%) e custo acima do preco (margem negativa) entram na ordem normal. */
    @Test
    void margemComCustoZeroENegativaEntramNaOrdem() {
        salvar(produto("Brinde").precoVenda("10.00").custo("0.00"));
        salvar(produto("Prejuízo").precoVenda("10.00").custo("12.00"));
        salvar(produto("Margem 50").precoVenda("10.00").custo("5.00"));
        salvar(produto("Sem custo").precoVenda("10.00"));

        assertThat(nomes(filtro(), OrdemDeProdutos.MARGEM))
                .containsExactly("Prejuízo", "Margem 50", "Brinde", "Sem custo");
        assertThat(nomes(filtro(), OrdemDeProdutos.MARGEM_DESC))
                .containsExactly("Brinde", "Margem 50", "Prejuízo", "Sem custo");
    }

    /** Saldo igual em todos (dois com o mesmo nome): as paginas nao repetem nem pulam itens. */
    @Test
    void estoqueIgualDesempataEntrePaginas() {
        List<Long> esperados = new ArrayList<>();
        for (String nome : List.of("Igual", "Igual", "B", "A", "C", "E", "D")) {
            saldo(salvar(produto(nome)), "5");
        }
        nomePorId.entrySet().stream()
                .sorted(Map.Entry.<Long, String>comparingByValue().thenComparing(Map.Entry.comparingByKey()))
                .forEach(entrada -> esperados.add(entrada.getKey()));

        for (OrdemDeProdutos ordem : List.of(OrdemDeProdutos.ESTOQUE, OrdemDeProdutos.ESTOQUE_DESC)) {
            List<Long> percorridos = new ArrayList<>();
            for (int pagina = 0; pagina < 4; pagina++) {
                percorridos.addAll(buscar(filtro(), ordem, pagina, 2).ids());
            }
            assertThat(percorridos).as("ordem %s", ordem).containsExactlyElementsOf(esperados);
        }
    }

    @Test
    void estoqueSemControleSempreNoFim() {
        saldo(salvar(produto("Saldo 7")), "7");
        salvar(produto("Saldo 0"));
        saldo(salvar(produto("Saldo 2.5")), "2.5");
        saldo(salvar(produto("Nao controla B").semControleDeEstoque()), "100");
        salvar(produto("Nao controla A").semControleDeEstoque());

        assertThat(nomes(filtro(), OrdemDeProdutos.ESTOQUE))
                .containsExactly("Saldo 0", "Saldo 2.5", "Saldo 7", "Nao controla A", "Nao controla B");
        assertThat(nomes(filtro(), OrdemDeProdutos.ESTOQUE_DESC))
                .containsExactly("Saldo 7", "Saldo 2.5", "Saldo 0", "Nao controla A", "Nao controla B");
    }

    @Test
    void ordemRecentesECriacaoEmpatadaPorNome() {
        criadoEm(salvar(produto("Antigo")), LocalDateTime.of(2026, 1, 1, 8, 0));
        criadoEm(salvar(produto("Novo B")), LocalDateTime.of(2026, 10, 1, 8, 0));
        criadoEm(salvar(produto("Novo A")), LocalDateTime.of(2026, 10, 1, 8, 0));
        criadoEm(salvar(produto("Meio")), LocalDateTime.of(2026, 5, 1, 8, 0));

        assertThat(nomes(filtro(), OrdemDeProdutos.RECENTES)).containsExactly("Novo A", "Novo B", "Meio", "Antigo");
    }

    @Test
    void ordemAtualizadosContaACriacaoDeQuemNuncaFoiEditado() {
        Produto editadoHoje = salvar(produto("Editado hoje"));
        criadoEm(editadoHoje, LocalDateTime.of(2026, 1, 1, 8, 0));
        atualizadoEm(editadoHoje, LocalDateTime.of(2026, 10, 23, 8, 0));
        criadoEm(salvar(produto("Criado ontem, nunca editado")), LocalDateTime.of(2026, 10, 22, 8, 0));
        Produto editadoAntes = salvar(produto("Editado em junho"));
        criadoEm(editadoAntes, LocalDateTime.of(2026, 1, 1, 8, 0));
        atualizadoEm(editadoAntes, LocalDateTime.of(2026, 6, 1, 8, 0));

        assertThat(nomes(filtro(), OrdemDeProdutos.ATUALIZADOS))
                .containsExactly("Editado hoje", "Criado ontem, nunca editado", "Editado em junho");
    }

    /** Review Focus 3: mesmo preco em todos; as paginas nao repetem nem pulam itens. */
    @Test
    void desempateEstavelEntrePaginas() {
        List<String> esperados = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            String nome = "Mesmo preço " + (char) ('J' - i);
            salvar(produto(nome).precoVenda("4.99"));
            esperados.add(0, nome);
        }

        Set<String> uniao = new LinkedHashSet<>();
        for (int pagina = 0; pagina < 4; pagina++) {
            PaginaDeIds resultado = buscar(filtro(), OrdemDeProdutos.PRECO, pagina, 3);
            assertThat(resultado.total()).isEqualTo(10);
            resultado.ids().forEach(id -> assertThat(uniao.add(nomePorId.get(id))).as("repetido").isTrue());
        }

        assertThat(uniao).containsExactlyElementsOf(esperados);
    }

    // ---------- Paginacao ----------

    @Test
    void paginacaoTotalEMeio() {
        seteProdutos();

        PaginaDeIds meio = buscar(filtro(), OrdemDeProdutos.NOME, 1, 3);

        assertThat(meio.total()).isEqualTo(7);
        assertThat(meio.ids()).extracting(nomePorId::get).containsExactly("Produto 4", "Produto 5", "Produto 6");
        assertThat(buscar(filtro(), OrdemDeProdutos.NOME, 2, 3).ids()).extracting(nomePorId::get)
                .containsExactly("Produto 7");
    }

    /** Total multiplo do tamanho: a ultima pagina vem cheia e a seguinte vazia, com o total. */
    @Test
    void paginaExatamenteNoLimite() {
        for (int i = 1; i <= 6; i++) {
            salvar(produto("Produto " + i));
        }

        PaginaDeIds ultima = buscar(filtro(), OrdemDeProdutos.NOME, 1, 3);
        PaginaDeIds seguinte = buscar(filtro(), OrdemDeProdutos.NOME, 2, 3);

        assertThat(ultima.ids()).extracting(nomePorId::get).containsExactly("Produto 4", "Produto 5", "Produto 6");
        assertThat(ultima.total()).isEqualTo(6);
        assertThat(seguinte.ids()).isEmpty();
        assertThat(seguinte.total()).isEqualTo(6);
    }

    @Test
    void paginaAlemDoFimVaziaComTotal() {
        seteProdutos();

        PaginaDeIds alemDoFim = buscar(filtro(), OrdemDeProdutos.NOME, 5, 3);

        assertThat(alemDoFim.ids()).isEmpty();
        assertThat(alemDoFim.total()).isEqualTo(7);
    }

    // ---------- Isolamento por empresa (DEC-016) ----------

    @Test
    void isolamentoPorEmpresa() {
        Empresa outra = novaEmpresa("Outra Empresa");
        salvar(produto("Arroz da A").codigo("96385074"));
        Produto daOutra = salvar(produtoDa(outra, "Arroz da B").codigo(EAN13));
        saldo(daOutra, "0");

        assertThat(nomes(filtro())).containsExactly("Arroz da A");
        assertThat(nomes(filtro().busca("arroz"))).containsExactly("Arroz da A");
        assertThat(nomes(filtro().busca(EAN13))).isEmpty();
        assertThat(nomes(filtro().estoque(EstoqueFiltro.SEM))).containsExactly("Arroz da A");
        assertThat(nomes(new Filtro(outra.getId()).busca("arroz"))).containsExactly("Arroz da B");
    }

    // ---------- Fase B2: busca por numero e codigo do produto (spec 6) ----------

    /** Review Focus 2: "542", "0542" e "000542" sao o mesmo codigo; a comparacao e exata (5420 fica fora). */
    @Test
    void buscaPorCodigoComESemZeros() {
        salvar(produto("Açúcar a granel").numero(1).codigoDoProduto(542));
        salvar(produto("Arroz a granel").numero(2).codigoDoProduto(5420));
        salvar(produto("Feijão").numero(3));

        for (String termo : List.of("542", "0542", "000542", " 0 542 ")) {
            assertThat(nomes(filtro().busca(termo))).as("busca [%s]", termo).containsExactly("Açúcar a granel");
        }
    }

    @Test
    void buscaPeloNumero() {
        salvar(produto("Leite").numero(15));
        salvar(produto("Café").numero(150));
        salvar(produto("Pão").numero(16).codigoDoProduto(7));

        assertThat(nomes(filtro().busca("15"))).containsExactly("Leite");
        assertThat(nomes(filtro().busca("015"))).containsExactly("Leite");
        assertThat(nomes(filtro().busca("7"))).containsExactly("Pão");
    }

    /** O termo numerico soma ao texto e aos codigos de barras (OU), nao substitui. */
    @Test
    void termoNumericoTambemBuscaTextoECodigoDeBarras() {
        salvar(produto("Pelo codigo").numero(1).codigoDoProduto(789));
        salvar(produto("Pelo numero").numero(789));
        salvar(produto("Leite 789 ml").numero(2));
        salvar(produto("Pelo codigo de barras").numero(3).codigo(EAN13));
        salvar(produto("Nada").numero(4).codigoDoProduto(78));

        assertThat(nomes(filtro().busca("789")))
                .containsExactly("Leite 789 ml", "Pelo codigo", "Pelo codigo de barras", "Pelo numero");
    }

    @Test
    void termoNaoNumericoNaoUsaNumero() {
        salvar(produto("Leite").numero(15).codigoDoProduto(15));

        assertThat(nomes(filtro().busca("15a"))).isEmpty();
        assertThat(nomes(filtro().busca("15-"))).isEmpty();
        assertThat(nomes(filtro().busca("n15"))).isEmpty();
    }

    @Test
    void termoComMaisDe18DigitosNaoQuebra() {
        salvar(produto("Leite").numero(1).codigoDoProduto(1));

        assertThat(nomes(filtro().busca("1234567890123456789"))).isEmpty();
        assertThat(nomes(filtro().busca("9".repeat(40)))).isEmpty();
        assertThat(nomes(filtro().busca("000000000000000000001"))).containsExactly("Leite");
    }

    /** DEC-016: numero e codigo iguais em outra empresa nao aparecem. */
    @Test
    void buscaNumericaIsolaPorEmpresa() {
        Empresa outra = novaEmpresa("Outra Lista");
        salvar(produtoDa(outra, "Da outra").numero(15).codigoDoProduto(542));
        salvar(produto("Daqui").numero(15).codigoDoProduto(542));

        assertThat(nomes(filtro().busca("15"))).containsExactly("Daqui");
        assertThat(nomes(filtro().busca("542"))).containsExactly("Daqui");
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    /** Filtro mutavel do teste; {@link #montar()} produz o {@link FiltroDeProdutos} de producao. */
    private static final class Filtro {
        private final Long empresaId;
        private List<String> palavras = List.of();
        private String termoDeCodigo;
        private StatusFiltro status = StatusFiltro.ATIVOS;
        private Set<Long> categoriaIds;
        private EstoqueFiltro estoque;
        private boolean emPromocao;
        private Long termoNumerico;

        Filtro(Long empresaId) {
            this.empresaId = empresaId;
        }

        /** O termo como o service o prepara: palavras normalizadas e o termo de codigo sem espacos. */
        Filtro busca(String termo) {
            this.palavras = TextoDeBusca.palavras(termo);
            this.termoDeCodigo = TextoDeBusca.termoDeCodigo(termo);
            this.termoNumerico = TextoDeBusca.termoNumerico(termo);
            return this;
        }

        /** So o termo de codigo, sem palavras (como fica um termo cujo texto some na normalizacao). */
        Filtro soCodigo(String termo) {
            this.palavras = List.of();
            this.termoDeCodigo = termo;
            this.termoNumerico = null;
            return this;
        }

        Filtro status(StatusFiltro valor) {
            this.status = valor;
            return this;
        }

        Filtro categorias(Set<Long> ids) {
            this.categoriaIds = ids;
            return this;
        }

        Filtro estoque(EstoqueFiltro valor) {
            this.estoque = valor;
            return this;
        }

        Filtro emPromocao() {
            this.emPromocao = true;
            return this;
        }

        FiltroDeProdutos montar() {
            return new FiltroDeProdutos(empresaId, palavras, termoDeCodigo, termoNumerico, status, categoriaIds,
                    estoque, emPromocao, HOJE);
        }
    }

    private Filtro filtro() {
        return new Filtro(empresa.getId());
    }

    private PaginaDeIds buscar(Filtro filtro, OrdemDeProdutos ordem, int pagina, int tamanho) {
        return consulta.buscar(filtro.montar(), ordem, pagina, tamanho);
    }

    /** Nomes da primeira pagina (grande), na ordem por nome. */
    private List<String> nomes(Filtro filtro) {
        return nomes(filtro, OrdemDeProdutos.NOME);
    }

    private List<String> nomes(Filtro filtro, OrdemDeProdutos ordem) {
        PaginaDeIds pagina = buscar(filtro, ordem, 0, TAMANHO_GRANDE);
        assertThat(pagina.total()).as("total coerente com a pagina").isEqualTo(pagina.ids().size());
        return pagina.ids().stream().map(nomePorId::get).toList();
    }

    private void doisAtivosEUmInativo() {
        salvar(produto("Ativo 2"));
        salvar(produto("Inativo").inativo());
        salvar(produto("Ativo 1"));
    }

    private void seteProdutos() {
        for (int i = 7; i >= 1; i--) {
            salvar(produto("Produto " + i));
        }
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

    private void criadoEm(Produto produto, LocalDateTime quando) {
        jdbcTemplate.update("UPDATE produtos SET criado_em = ? WHERE id = ?", quando, produto.getId());
    }

    private void atualizadoEm(Produto produto, LocalDateTime quando) {
        jdbcTemplate.update("UPDATE produtos SET atualizado_em = ? WHERE id = ?", quando, produto.getId());
    }

    private Categoria categoria(Categoria pai, String nome) {
        return categoriaRepository.saveAndFlush(new Categoria(empresa, pai, nome));
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
