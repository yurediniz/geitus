package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

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

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaRepository;
import com.geitus.app.catalog.marca.Marca;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.catalog.unidade.UnidadeMedidaRepository;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;

/**
 * Teste de integracao do {@link ProdutoRepository} contra um PostgreSQL real
 * (Testcontainers). Exercita as queries derivadas, JPQL e nativas de verdade —
 * algo que o {@code @WebMvcTest} com mock NAO faz e que ja escondeu um bug de
 * query (function lower(bytea) does not exist). Cobre isolamento por empresa
 * (DEC-016), a carga dos produtos da pagina com os vinculos (etapa 2 da
 * listagem; a busca, os filtros e a ordem ficam no {@code ConsultaDeProdutosIT}),
 * as colunas da busca (V10), unicidade de SKU e de codigo de barras por empresa, a marca (V14), SKUs no
 * padrao da sugestao e o mapeamento dos vinculos (V6) e dos codigos (V7).
 *
 * <p>Usa o banco do container (nao o H2 de teste) via
 * {@code @AutoConfigureTestDatabase(replace = NONE)} e deixa o Flyway aplicar
 * as migrations reais no container, garantindo o mesmo schema de producao.
 *
 * <p>Requer Docker disponivel no ambiente.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Testcontainers
class ProdutoRepositoryIT {


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
    private ProdutoRepository produtoRepository;

    @Autowired
    private EmpresaRepository empresaRepository;

    @Autowired
    private UnidadeMedidaRepository unidadeRepository;

    @Autowired
    private CategoriaRepository categoriaRepository;

    /** Unidade UN criada para cada empresa do teste (unidade de venda e obrigatoria desde a V6). */
    private final Map<Long, UnidadeMedida> unidadePorEmpresa = new HashMap<>();

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
        Empresa salva = empresaRepository.saveAndFlush(empresa);
        unidadePorEmpresa.put(salva.getId(), novaUnidade(salva, "UN"));
        return salva;
    }

    private UnidadeMedida novaUnidade(Empresa empresa, String sigla) {
        return unidadeRepository.saveAndFlush(new UnidadeMedida(empresa, sigla, "Unidade " + sigla, false));
    }

    private ProdutoTesteBuilder produtoDa(Empresa empresa) {
        return ProdutoTesteBuilder.produto(empresa, unidadePorEmpresa.get(empresa.getId()));
    }

    private Produto salvar(ProdutoTesteBuilder builder) {
        return produtoRepository.saveAndFlush(builder.build());
    }

    private long contarDaEmpresa(Empresa empresa) {
        return entityManager.getEntityManager()
                .createQuery("SELECT count(p) FROM Produto p WHERE p.empresa.id = :empresaId", Long.class)
                .setParameter("empresaId", empresa.getId())
                .getSingleResult();
    }

    private Produto novoProduto(Empresa empresa, String nome, String sku, boolean ativo) {
        ProdutoTesteBuilder builder = produtoDa(empresa).nome(nome).sku(sku);
        return salvar(ativo ? builder : builder.inativo());
    }

    // ---------- Campos cadastrais V4 (descricao, hints de estoque/preco) e marca (V14) ----------

    @Test
    void devePersistirERelerOsCamposCadastraisDaV4() {
        Empresa empresa = novaEmpresa("Empresa V4");
        Long id = salvar(produtoDa(empresa).nome("Arroz 5kg").precoVenda("25.90").custo("18.00")
                .estoqueMinimo("2").sku("SKU-V4").marca(novaMarca(empresa, "Tio João"))
                .descricao("Arroz branco tipo 1, pacote de 5kg.")
                .estoqueMaximo("50.000").pontoReposicao("10.000").precoMinimo("20.00")).getId();

        // Limpa o contexto de persistencia (cache de 1o nivel) para forcar um
        // SELECT real no banco em vez de devolver a instancia ja gerenciada.
        entityManager.clear();
        Produto relido = produtoRepository.findById(id).orElseThrow();

        assertThat(relido.getMarca().getNome()).isEqualTo("Tio João");
        assertThat(relido.getDescricao()).isEqualTo("Arroz branco tipo 1, pacote de 5kg.");
        assertThat(relido.getEstoqueMaximo()).isEqualByComparingTo("50.000");
        assertThat(relido.getPontoReposicao()).isEqualByComparingTo("10.000");
        assertThat(relido.getPrecoMinimo()).isEqualByComparingTo("20.00");
    }

    // ---------- Fase C: busca com trava para a edicao ----------

    /**
     * {@code buscarPorUuidParaAtualizar} (SELECT ... FOR UPDATE) roda no
     * Postgres real dentro da transacao do teste e respeita a empresa
     * (DEC-016). A concorrencia em si nao e simulada aqui.
     */
    @Test
    void buscarPorUuidParaAtualizarTravaSoProdutoDaEmpresa() {
        Empresa empresaA = novaEmpresa("Empresa Trava A");
        Empresa empresaB = novaEmpresa("Empresa Trava B");
        Produto produto = salvar(produtoDa(empresaA).nome("Arroz").precoVenda("10.00"));
        entityManager.clear();

        assertThat(produtoRepository.buscarPorUuidParaAtualizar(produto.getUuid(), empresaA.getId()))
                .get().extracting(Produto::getNome).isEqualTo("Arroz");
        assertThat(produtoRepository.buscarPorUuidParaAtualizar(produto.getUuid(), empresaB.getId())).isEmpty();
        assertThat(produtoRepository.buscarPorUuidParaAtualizar(UUID.randomUUID(), empresaA.getId())).isEmpty();
    }

    // ---------- Identificacao (V7): uuid, nome curto e codigos ----------

    @Test
    void devePersistirERelerUuidNomeCurtoECodigosNaOrdem() {
        Empresa empresa = novaEmpresa("Empresa V7");
        Produto salvo = salvar(produtoDa(empresa).nome("Ração Golden 15kg").nomeCurto("Golden 15kg")
                .codigo("96385074").codigo("ABC-1").codigo("7891000315507"));
        UUID uuid = salvo.getUuid();

        entityManager.clear();
        Produto relido = produtoRepository.findByUuidAndEmpresa_Id(uuid, empresa.getId()).orElseThrow();

        assertThat(relido.getUuid()).isEqualTo(uuid);
        assertThat(relido.getNomeCurto()).isEqualTo("Golden 15kg");
        assertThat(org.hibernate.Hibernate.isInitialized(relido.getCodigosBarras())).isTrue();
        assertThat(relido.getCodigosBarras()).extracting(ProdutoCodigoBarras::getCodigo)
                .containsExactly("96385074", "ABC-1", "7891000315507");
        assertThat(relido.getCodigosBarras()).extracting(ProdutoCodigoBarras::getFormato)
                .containsExactly(FormatoCodigoBarras.EAN8, FormatoCodigoBarras.OUTRO, FormatoCodigoBarras.EAN13);
        assertThat(relido.getCodigosBarras()).allSatisfy(codigo -> assertThat(codigo.getCriadoEm()).isNotNull());
    }

    @Test
    void reordenarCodigosReaproveitaAsLinhasSemViolarUnicidade() {
        // I2 do data-reviewer: recriar a linha de um codigo mantido violaria
        // uq_codigo_barras_empresa (o Hibernate insere antes de apagar orfaos).
        Empresa empresa = novaEmpresa("Empresa Reordenar");
        Produto produto = salvar(produtoDa(empresa).codigo("96385074").codigo("ABC-1"));
        List<Long> idsAntes = produto.getCodigosBarras().stream().map(ProdutoCodigoBarras::getId).toList();

        produto.substituirCodigos(List.of(new CodigoBarrasValidado("ABC-1", FormatoCodigoBarras.OUTRO),
                new CodigoBarrasValidado("96385074", FormatoCodigoBarras.EAN8),
                new CodigoBarrasValidado("NOVO-1", FormatoCodigoBarras.OUTRO)));
        produtoRepository.saveAndFlush(produto);
        entityManager.clear();

        Produto relido = produtoRepository.findByUuidAndEmpresa_Id(produto.getUuid(), empresa.getId())
                .orElseThrow();
        assertThat(relido.getCodigosBarras()).extracting(ProdutoCodigoBarras::getCodigo)
                .containsExactly("ABC-1", "96385074", "NOVO-1");
        assertThat(relido.getCodigosBarras().subList(0, 2)).extracting(ProdutoCodigoBarras::getId)
                .containsExactly(idsAntes.get(1), idsAntes.get(0));
    }

    @Test
    void codigoUnicoPorEmpresaPermiteMesmoCodigoEmOutraEmpresa() {
        // Review Focus 3: mesmo codigo em empresas diferentes e permitido, e a
        // consulta do nome do produto nunca cruza a empresa.
        Empresa empresaA = novaEmpresa("Empresa Codigo A");
        Empresa empresaB = novaEmpresa("Empresa Codigo B");
        Produto daA = salvar(produtoDa(empresaA).nome("Arroz da A").codigo("7891000315507"));
        Produto daB = salvar(produtoDa(empresaB).nome("Arroz da B").codigo("7891000315507"));

        assertThat(produtoRepository.produtoComCodigo(empresaA.getId(), "7891000315507", null))
                .contains("Arroz da A");
        assertThat(produtoRepository.produtoComCodigo(empresaB.getId(), "7891000315507", null))
                .contains("Arroz da B");
        // Ignorando o proprio produto, nao ha conflito em nenhuma das empresas.
        assertThat(produtoRepository.produtoComCodigo(empresaA.getId(), "7891000315507", daA.getId())).isEmpty();
        assertThat(produtoRepository.produtoComCodigo(empresaB.getId(), "7891000315507", daB.getId())).isEmpty();
        assertThat(produtoRepository.produtoComCodigo(empresaA.getId(), "inexistente", null)).isEmpty();
    }

    @Test
    void produtoComCodigoNaEdicaoDevolveONomeDeOutroProdutoDaEmpresa() {
        // Lacuna do QA: com ignorarProdutoId NAO nulo (edicao), a JPQL precisa
        // devolver o nome do OUTRO produto que ja tem o codigo — nao so vazio.
        Empresa empresaA = novaEmpresa("Empresa Codigo Edicao A");
        salvar(produtoDa(empresaA).nome("Arroz da A").codigo("7891000315507"));
        Produto feijao = salvar(produtoDa(empresaA).nome("Feijão da A"));
        entityManager.clear();

        assertThat(produtoRepository.produtoComCodigo(empresaA.getId(), "7891000315507", feijao.getId()))
                .contains("Arroz da A");
    }

    @Test
    void codigoRepetidoNaMesmaEmpresaViolaAConstraint() {
        Empresa empresa = novaEmpresa("Empresa Codigo Repetido");
        salvar(produtoDa(empresa).nome("Primeiro").codigo("7891000315507"));

        assertThatThrownBy(() -> salvar(produtoDa(empresa).nome("Segundo").codigo("7891000315507")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    // ---------- Unidade e categoria (V6) ----------

    @Test
    void devePersistirERelerUnidadeECategoria() {
        Empresa empresa = novaEmpresa("Empresa Vinculos");
        Categoria racao = categoriaRepository.saveAndFlush(new Categoria(empresa, null, "Ração"));
        UUID uuid = salvar(produtoDa(empresa).nome("Sachê").categoria(racao).precoVenda("3.50")).getUuid();

        entityManager.clear();
        Produto relido = produtoRepository.findByUuidAndEmpresa_Id(uuid, empresa.getId()).orElseThrow();

        assertThat(relido.getUnidade().getSigla()).isEqualTo("UN");
        assertThat(relido.getCategoria().getNome()).isEqualTo("Ração");
    }

    /**
     * Etapa 2 da listagem (Fase E): os produtos dos ids com os vinculos e os
     * codigos ja carregados, sem duplicar o produto com dois codigos e sem
     * perder produto sem categoria.
     */
    @Test
    void buscarComRelacoesPorIdsTrazOsVinculosSemPerderProdutoSemCategoria() {
        Empresa empresa = novaEmpresa("Empresa Listagem Vinculos");
        Categoria bebidas = categoriaRepository.saveAndFlush(new Categoria(empresa, null, "Bebidas"));
        Produto agua = salvar(produtoDa(empresa).nome("Agua").categoria(bebidas).precoVenda("2.00")
                .sku("SKU-AGUA").codigo("96385074").codigo("ABC-1"));
        Produto bala = novoProduto(empresa, "Bala", null, true);
        entityManager.clear();

        List<Produto> todos = produtoRepository.buscarComRelacoesPorIds(empresa.getId(),
                        List.of(bala.getId(), agua.getId())).stream()
                .sorted(Comparator.comparing(Produto::getNome))
                .toList();

        // JOIN FETCH da colecao nao duplica o produto com dois codigos.
        assertThat(todos).extracting(Produto::getNome).containsExactly("Agua", "Bala");
        // JOIN FETCH: os vinculos e os codigos ja vem carregados (sem proxy pendente).
        assertThat(org.hibernate.Hibernate.isInitialized(todos.get(0).getUnidade())).isTrue();
        assertThat(org.hibernate.Hibernate.isInitialized(todos.get(0).getCategoria())).isTrue();
        assertThat(org.hibernate.Hibernate.isInitialized(todos.get(0).getCodigosBarras())).isTrue();
        assertThat(todos.get(0).getCodigosBarras()).extracting(ProdutoCodigoBarras::getCodigo)
                .containsExactly("96385074", "ABC-1");
        assertThat(todos.get(0).getCategoria().getNome()).isEqualTo("Bebidas");
        assertThat(todos.get(1).getCategoria()).isNull();
        assertThat(todos.get(1).getCodigosBarras()).isEmpty();
    }

    /** Id de produto de outra empresa nunca volta, mesmo se pedido (DEC-016). */
    @Test
    void buscarComRelacoesPorIdsIgnoraIdsDeOutraEmpresa() {
        Empresa empresaA = novaEmpresa("Empresa Ids A");
        Empresa empresaB = novaEmpresa("Empresa Ids B");
        Produto daA = novoProduto(empresaA, "Da A", null, true);
        Produto daB = novoProduto(empresaB, "Da B", null, true);

        assertThat(produtoRepository.buscarComRelacoesPorIds(empresaA.getId(), List.of(daA.getId(), daB.getId())))
                .extracting(Produto::getNome).containsExactly("Da A");
    }

    @Test
    void colunasDaBuscaSaoGravadasERelidas() {
        Empresa empresa = novaEmpresa("Empresa Busca Gravada");
        Produto produto = salvar(produtoDa(empresa).nome("Ração Golden").nomeCurto("GLD").sku("P1")
                .marca(novaMarca(empresa, "Premier")));
        entityManager.clear();

        Produto relido = produtoRepository.findById(produto.getId()).orElseThrow();

        assertThat(relido.getNomeNormalizado()).isEqualTo("racao golden");
        assertThat(relido.getBuscaNormalizada()).isEqualTo("racao golden gld p1 premier");
    }

    // ---------- Isolamento por empresa (DEC-016) ----------

    @Test
    void findByUuidAndEmpresaNaoDeveEncontrarProdutoDeOutraEmpresa() {
        Empresa empresaA = novaEmpresa("Empresa A");
        Empresa empresaB = novaEmpresa("Empresa B");
        Produto produtoDaA = novoProduto(empresaA, "Arroz", "SKU-A", true);

        assertThat(produtoRepository.findByUuidAndEmpresa_Id(produtoDaA.getUuid(), empresaA.getId()))
                .isPresent();
        assertThat(produtoRepository.findByUuidAndEmpresa_Id(produtoDaA.getUuid(), empresaB.getId()))
                .isEmpty();
    }

    // ---------- Unicidade de SKU ----------

    @Test
    void doisProdutosSemSkuNemCodigosDevemCoexistirNaMesmaEmpresa() {
        Empresa empresa = novaEmpresa("Empresa Nulos");
        novoProduto(empresa, "Sem Codigos 1", null, true);
        novoProduto(empresa, "Sem Codigos 2", null, true);

        // A constraint UNIQUE(empresa_id, sku) trata multiplos NULL como
        // nao-conflitantes: os dois produtos convivem sem violar integridade.
        assertThat(contarDaEmpresa(empresa)).isEqualTo(2);
    }

    @Test
    void existsBySkuAndEmpresaDeveDetectarDuplicadoNaMesmaEmpresa() {
        Empresa empresa = novaEmpresa("Empresa SKU");
        novoProduto(empresa, "Produto", "SKU-UNICO", true);

        assertThat(produtoRepository.existsBySkuAndEmpresa_Id("SKU-UNICO", empresa.getId())).isTrue();
        assertThat(produtoRepository.existsBySkuAndEmpresa_Id("SKU-OUTRO", empresa.getId())).isFalse();
    }

    @Test
    void mesmoSkuEmEmpresasDiferentesNaoDeveConflitar() {
        Empresa empresaA = novaEmpresa("Empresa SKU A");
        Empresa empresaB = novaEmpresa("Empresa SKU B");
        novoProduto(empresaA, "Produto A", "SKU-COMPARTILHADO", true);
        novoProduto(empresaB, "Produto B", "SKU-COMPARTILHADO", true);

        assertThat(produtoRepository.existsBySkuAndEmpresa_Id("SKU-COMPARTILHADO", empresaA.getId())).isTrue();
        assertThat(produtoRepository.existsBySkuAndEmpresa_Id("SKU-COMPARTILHADO", empresaB.getId())).isTrue();
        // Cada empresa enxerga apenas o proprio produto.
        assertThat(contarDaEmpresa(empresaA)).isEqualTo(1);
        assertThat(contarDaEmpresa(empresaB)).isEqualTo(1);
    }

    // ---------- SKU sugerido (spec 4.2) ----------

    @Test
    void skusNoPadraoSoDaEmpresaESoNoFormatoExato() {
        Empresa empresa = novaEmpresa("Empresa SKU Padrao");
        Empresa outra = novaEmpresa("Empresa SKU Padrao Outra");
        for (String sku : List.of("P000001", "P000007", "P1000000", "ABC", "p000009", "P12345", "PX000001",
                "P000002-A")) {
            novoProduto(empresa, "Produto " + sku, sku, true);
        }
        novoProduto(outra, "Da outra", "P999999", true);
        novoProduto(empresa, "Sem SKU", null, true);

        assertThat(produtoRepository.skusNoPadrao(empresa.getId()))
                .containsExactlyInAnyOrder("P000001", "P000007", "P1000000");
    }

    // ---------- Fase B2: numero e codigo do produto ----------

    /** {@code updatable = false}: mudar o numero na entidade nao chega ao banco, mesmo com outro UPDATE. */
    @Test
    void numeroNaoEAtualizadoDepoisDaCriacao() {
        Empresa empresa = novaEmpresa("Empresa Numero Imutavel");
        Produto produto = salvar(produtoDa(empresa).numero(41));

        ReflectionTestUtils.setField(produto, "numero", 99L);
        produto.inativar();
        produtoRepository.saveAndFlush(produto);
        entityManager.clear();

        Produto relido = produtoRepository.findByUuidAndEmpresa_Id(produto.getUuid(), empresa.getId()).orElseThrow();
        assertThat(relido.getNumero()).isEqualTo(41L);
        assertThat(relido.isAtivo()).isFalse();
    }

    @Test
    void codigoEBalancaGravadosERelidos() {
        Empresa empresa = novaEmpresa("Empresa Codigo Gravado");
        Produto produto = salvar(produtoDa(empresa).codigoDoProduto(542).vendidoBalanca());
        entityManager.clear();

        Produto relido = produtoRepository.findByUuidAndEmpresa_Id(produto.getUuid(), empresa.getId()).orElseThrow();
        assertThat(relido.getCodigo()).isEqualTo(542);
        assertThat(relido.isVendidoBalanca()).isTrue();
    }

    /** A consulta do codigo repetido isola por empresa (DEC-016) e ignora o proprio produto na edicao. */
    @Test
    void nomeDoProdutoComCodigoIsolaPorEmpresaEIgnoraOProprio() {
        Empresa empresaA = novaEmpresa("Empresa Codigo A");
        Empresa empresaB = novaEmpresa("Empresa Codigo B");
        Produto acucar = salvar(produtoDa(empresaA).nome("Açúcar a granel").codigoDoProduto(542));
        salvar(produtoDa(empresaA).nome("Sem codigo"));

        assertThat(produtoRepository.nomeDoProdutoComCodigo(empresaA.getId(), 542, null))
                .contains("Açúcar a granel");
        assertThat(produtoRepository.nomeDoProdutoComCodigo(empresaA.getId(), 542, acucar.getId())).isEmpty();
        assertThat(produtoRepository.nomeDoProdutoComCodigo(empresaB.getId(), 542, null)).isEmpty();
        assertThat(produtoRepository.nomeDoProdutoComCodigo(empresaA.getId(), 543, null)).isEmpty();
    }

    @Test
    void codigoRepetidoNaEmpresaEhRecusadoPeloBanco() {
        Empresa empresaA = novaEmpresa("Empresa Codigo Unico A");
        Empresa empresaB = novaEmpresa("Empresa Codigo Unico B");
        salvar(produtoDa(empresaA).codigoDoProduto(542));
        salvar(produtoDa(empresaB).codigoDoProduto(542));

        assertThatThrownBy(() -> salvar(produtoDa(empresaA).codigoDoProduto(542)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    /** Marca na raiz da empresa (Fase B5), ja gravada. */
    private Marca novaMarca(Empresa empresa, String nome) {
        return entityManager.persistFlushFind(new Marca(empresa, null, nome));
    }
}
