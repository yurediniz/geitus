package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.geitus.app.catalog.dto.EmbalagemRequest;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaRequest;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.iam.JwtService;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

import jakarta.persistence.EntityManagerFactory;

/**
 * Embalagens no cadastro do produto de ponta a ponta (filtro JWT, controller,
 * service, Hibernate e PostgreSQL real; docs/modules/produtos.md):
 * o ciclo da lista, os precos e o historico, os conflitos de
 * codigo, o isolamento e os Review Focus 1 a 4 da Fase B3.
 *
 * <p>Sem {@code @Transactional} na classe: cada requisicao abre e confirma a
 * propria transacao, como em producao. Cada teste usa uma empresa nova.
 * Requer Docker.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ProdutoEmbalagensIT {

    private static final AtomicInteger SEQUENCIA = new AtomicInteger();
    private static final String EAN_UNIDADE = "7891000315507";
    private static final String EAN_CAIXA = "7894900011517";
    private static final String EAN_FARDO = "96385074";
    /** Rodadas da corrida: sem o tratamento, ao menos uma costuma dar 500. */
    private static final int RODADAS_CONCORRENTES = 5;
    private static final long ESPERA_MAXIMA_SEGUNDOS = 30;

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
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private EmpresaRepository empresaRepository;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private UnidadeMedidaService unidadeService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private Clock relogio;

    @Autowired
    private ProdutoService produtoService;

    @Autowired
    private ProdutoRepository produtoRepository;

    @Autowired
    private PlatformTransactionManager gerenciadorDeTransacoes;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    // ---------- Ciclo da lista ----------

    @Test
    void criarComEmbalagensMostraRotuloPrecoMargemECodigosSeparados() throws Exception {
        Loja loja = novaLoja();

        cadastrar(loja, nexgard(loja))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.codigosBarras.length()").value(1))
                .andExpect(jsonPath("$.codigosBarras[0].codigo").value(EAN_UNIDADE))
                .andExpect(jsonPath("$.embalagens.length()").value(2))
                .andExpect(jsonPath("$.embalagens[0].rotulo").value("CX c/ 3 UN"))
                .andExpect(jsonPath("$.embalagens[0].unidade.sigla").value("CX"))
                .andExpect(jsonPath("$.embalagens[0].preco").value(209.90))
                .andExpect(jsonPath("$.embalagens[0].precoEfetivo").value(209.90))
                .andExpect(jsonPath("$.embalagens[0].origemPreco").value("PROPRIO"))
                .andExpect(jsonPath("$.embalagens[0].custo").value(150.00))
                .andExpect(jsonPath("$.embalagens[0].margem").value(28.54))
                .andExpect(jsonPath("$.embalagens[0].markup").value(39.93))
                .andExpect(jsonPath("$.embalagens[0].deCompra").value(false))
                .andExpect(jsonPath("$.embalagens[0].codigosBarras[0].codigo").value(EAN_CAIXA))
                .andExpect(jsonPath("$.embalagens[0].codigosBarras[0].formato").value("EAN13"))
                .andExpect(jsonPath("$.embalagens[1].rotulo").value("FD c/ 12 UN"))
                .andExpect(jsonPath("$.embalagens[1].preco").doesNotExist())
                .andExpect(jsonPath("$.embalagens[1].precoEfetivo").value(1078.80))
                .andExpect(jsonPath("$.embalagens[1].origemPreco").value("UNIDADE"))
                .andExpect(jsonPath("$.embalagens[1].deCompra").value(true))
                .andExpect(jsonPath("$.unidadeCompra").doesNotExist());
    }

    @Test
    void patchSemEmbalagensMantemALista() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));

        Map<String, Object> semLista = nexgard(loja);
        semLista.remove("embalagens");
        semLista.put("nome", "Nexgard Combo Gatos");

        atualizar(loja, id(criado), semLista)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nome").value("Nexgard Combo Gatos"))
                .andExpect(jsonPath("$.embalagens.length()").value(2))
                .andExpect(jsonPath("$.embalagens[0].codigosBarras[0].codigo").value(EAN_CAIXA));
    }

    @Test
    void trocarOPrecoMantendoOIdPreservaOsCodigosEGravaOHistorico() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));
        UUID produto = id(criado);
        Long linhaDoCodigo = idDoCodigo(produto, EAN_CAIXA);

        Map<String, Object> novoPreco = comEmbalagens(loja, criado,
                embalagem(idDaEmbalagem(criado, 0), loja.unidade("CX"), "3", "199.90", false, EAN_CAIXA),
                embalagem(idDaEmbalagem(criado, 1), loja.unidade("FD"), "12", null, true, EAN_FARDO));

        atualizar(loja, produto, novoPreco)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.embalagens[0].id").value(idDaEmbalagem(criado, 0).toString()))
                .andExpect(jsonPath("$.embalagens[0].precoEfetivo").value(199.90));

        assertThat(idDoCodigo(produto, EAN_CAIXA)).isEqualTo(linhaDoCodigo);
        assertThat(historicoDasEmbalagens(produto)).containsExactly(
                "CX c/ 3 UN: null -> 209.90", "CX c/ 3 UN: 209.90 -> 199.90");
        historico(loja, produto)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens[0].campo").value("PRECO_EMBALAGEM"))
                .andExpect(jsonPath("$.itens[0].embalagemRotulo").value("CX c/ 3 UN"))
                .andExpect(jsonPath("$.itens[0].valorAnterior").value(209.90))
                .andExpect(jsonPath("$.itens[0].valorNovo").value(199.90));
    }

    @Test
    void removerAEmbalagemApagaOsCodigosERegistraOPrecoQueSai() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));
        UUID produto = id(criado);

        atualizar(loja, produto, comEmbalagens(loja, criado,
                embalagem(idDaEmbalagem(criado, 1), loja.unidade("FD"), "12", null, true, EAN_FARDO)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.embalagens.length()").value(1))
                .andExpect(jsonPath("$.embalagens[0].rotulo").value("FD c/ 12 UN"));

        assertThat(contar("SELECT count(*) FROM produto_codigos_barras c JOIN produtos p ON p.id = c.produto_id"
                + " WHERE p.uuid = ? AND c.codigo = ?", produto, EAN_CAIXA)).isZero();
        assertThat(contar("SELECT count(*) FROM produto_embalagens e JOIN produtos p ON p.id = e.produto_id"
                + " WHERE p.uuid = ?", produto)).isEqualTo(1);
        assertThat(historicoDasEmbalagens(produto)).containsExactly(
                "CX c/ 3 UN: null -> 209.90", "CX c/ 3 UN: 209.90 -> null");
    }

    /** Apagar o preco proprio volta ao calculado e registra preco → vazio; sem mudanca, nenhuma linha. */
    @Test
    void apagarOPrecoVoltaAoCalculado() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));
        UUID produto = id(criado);
        Map<String, Object> semPreco = comEmbalagens(loja, criado,
                embalagem(idDaEmbalagem(criado, 0), loja.unidade("CX"), "3", null, false, EAN_CAIXA),
                embalagem(idDaEmbalagem(criado, 1), loja.unidade("FD"), "12", null, true, EAN_FARDO));

        atualizar(loja, produto, semPreco)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.embalagens[0].precoEfetivo").value(269.70))
                .andExpect(jsonPath("$.embalagens[0].origemPreco").value("UNIDADE"));
        atualizar(loja, produto, semPreco).andExpect(status().isOk());

        assertThat(historicoDasEmbalagens(produto)).containsExactly(
                "CX c/ 3 UN: null -> 209.90", "CX c/ 3 UN: 209.90 -> null");
    }

    // ---------- atualizadoEm (revisao da B3) ----------

    /**
     * {@code atualizado_em} so muda quando algo muda: o PATCH identico e o
     * PATCH sem a lista nao carimbam; trocar so o preco de uma embalagem carimba.
     */
    @Test
    void atualizadoEmSoMudaComAlteracaoReal() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));
        UUID produto = id(criado);
        Map<String, Object> renomeado = nexgard(loja);
        renomeado.put("nome", "Nexgard Combo Cães");
        renomeado.put("embalagens", List.of(
                embalagem(idDaEmbalagem(criado, 0), loja.unidade("CX"), "3", "209.90", false, EAN_CAIXA),
                embalagem(idDaEmbalagem(criado, 1), loja.unidade("FD"), "12", null, true, EAN_FARDO)));
        atualizar(loja, produto, renomeado).andExpect(status().isOk());
        String depoisDoNome = atualizadoEm(produto);
        assertThat(depoisDoNome).isNotNull();

        atualizar(loja, produto, renomeado).andExpect(status().isOk());
        assertThat(atualizadoEm(produto)).as("PATCH identico").isEqualTo(depoisDoNome);

        Map<String, Object> semLista = new LinkedHashMap<>(renomeado);
        semLista.remove("embalagens");
        atualizar(loja, produto, semLista).andExpect(status().isOk());
        assertThat(atualizadoEm(produto)).as("PATCH sem a lista").isEqualTo(depoisDoNome);

        Map<String, Object> outroPreco = new LinkedHashMap<>(renomeado);
        outroPreco.put("embalagens", List.of(
                embalagem(idDaEmbalagem(criado, 0), loja.unidade("CX"), "3", "199.90", false, EAN_CAIXA),
                embalagem(idDaEmbalagem(criado, 1), loja.unidade("FD"), "12", null, true, EAN_FARDO)));
        atualizar(loja, produto, outroPreco).andExpect(status().isOk());
        assertThat(atualizadoEm(produto)).as("so o preco da embalagem").isNotEqualTo(depoisDoNome);
    }

    /** Trocar so um codigo de barras de uma embalagem tambem e uma alteracao do produto. */
    @Test
    void atualizadoEmMudaComOCodigoDaEmbalagem() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));
        UUID produto = id(criado);
        Map<String, Object> renomeado = comEmbalagens(loja, criado,
                embalagem(idDaEmbalagem(criado, 0), loja.unidade("CX"), "3", "209.90", false, EAN_CAIXA),
                embalagem(idDaEmbalagem(criado, 1), loja.unidade("FD"), "12", null, true, EAN_FARDO));
        renomeado.put("nome", "Nexgard Combo Cães");
        atualizar(loja, produto, renomeado).andExpect(status().isOk());
        String antes = atualizadoEm(produto);
        assertThat(antes).isNotNull();
        Map<String, Object> semCodigoDaCaixa = comEmbalagens(loja, criado,
                embalagem(idDaEmbalagem(criado, 0), loja.unidade("CX"), "3", "209.90", false),
                embalagem(idDaEmbalagem(criado, 1), loja.unidade("FD"), "12", null, true, EAN_FARDO));
        semCodigoDaCaixa.put("nome", "Nexgard Combo Cães");

        atualizar(loja, produto, semCodigoDaCaixa).andExpect(status().isOk());

        assertThat(atualizadoEm(produto)).isNotEqualTo(antes);
    }

    // ---------- Limites e bordas (rodada final do qa-reviewer) ----------

    /** Limite cheio: 10 embalagens com 5 codigos cada e 20 codigos na unidade; o PATCH igual nao muda nada. */
    @Test
    void limiteCheioDeEmbalagensECodigos() throws Exception {
        Loja loja = novaLoja();
        Map<String, Object> cheio = produto(loja, "Limite cheio", "UN", "10.00");
        List<String> codigosDaUnidade = new ArrayList<>();
        for (int indice = 1; indice <= 20; indice++) {
            codigosDaUnidade.add("U-" + indice);
        }
        cheio.put("codigosBarras", codigosDaUnidade);
        List<Map<String, Object>> embalagens = new ArrayList<>();
        for (int quantidade = 2; quantidade <= 11; quantidade++) {
            embalagens.add(embalagem(null, loja.unidade("CX"), String.valueOf(quantidade),
                    String.valueOf(quantidade * 10) + ".00", quantidade == 2, codigosDaEmbalagem(quantidade)));
        }
        cheio.put("embalagens", embalagens);

        JsonNode criado = corpoDe(cadastrar(loja, cheio));

        assertThat(criado.at("/codigosBarras").size()).isEqualTo(20);
        assertThat(criado.at("/embalagens").size()).isEqualTo(10);
        int codigosNasEmbalagens = 0;
        for (int indice = 0; indice < 10; indice++) {
            assertThat(criado.at("/embalagens/" + indice + "/rotulo").asText()).isEqualTo("CX c/ " + (indice + 2)
                    + " UN");
            assertThat(criado.at("/embalagens/" + indice + "/codigosBarras/0/codigo").asText())
                    .isEqualTo("E" + (indice + 2) + "-1");
            codigosNasEmbalagens += criado.at("/embalagens/" + indice + "/codigosBarras").size();
        }
        assertThat(codigosNasEmbalagens).isEqualTo(50);
        UUID produto = id(criado);
        long linhasDeHistorico = historicoDasEmbalagens(produto).size();
        String atualizadoAntes = atualizadoEm(produto);

        List<Map<String, Object>> mesmasComId = new ArrayList<>();
        for (int indice = 0; indice < 10; indice++) {
            Map<String, Object> mesma = new LinkedHashMap<>(embalagens.get(indice));
            mesma.put("id", criado.at("/embalagens/" + indice + "/id").asText());
            mesmasComId.add(mesma);
        }
        Map<String, Object> igual = new LinkedHashMap<>(cheio);
        igual.put("embalagens", mesmasComId);
        atualizar(loja, produto, igual)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.embalagens.length()").value(10));

        assertThat(historicoDasEmbalagens(produto)).hasSize((int) linhasDeHistorico);
        assertThat(atualizadoEm(produto)).isEqualTo(atualizadoAntes);
    }

    private static String[] codigosDaEmbalagem(int quantidade) {
        String[] codigos = new String[5];
        for (int indice = 0; indice < 5; indice++) {
            codigos[indice] = "E" + quantidade + "-" + (indice + 1);
        }
        return codigos;
    }

    /** PATCH sem a lista: o preco minimo novo e conferido contra as embalagens atuais. */
    @Test
    void patchSemEmbalagensConfereOPrecoMinimoNovo() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));
        Map<String, Object> comMinimo = nexgard(loja);
        comMinimo.remove("embalagens");
        comMinimo.put("precoMinimo", "70.00");

        erro(atualizar(loja, id(criado), comMinimo), 400,
                "O preço da embalagem dá R$ 69,96 por UN, abaixo do preço mínimo (R$ 70,00).", "embalagens[0].preco");
    }

    /** A CX sai e o codigo dela vai para a lista da unidade no mesmo PATCH. */
    @Test
    void codigoDaEmbalagemRemovidaVaiParaAUnidade() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));
        Map<String, Object> semACaixa = comEmbalagens(loja, criado,
                embalagem(idDaEmbalagem(criado, 1), loja.unidade("FD"), "12", null, true, EAN_FARDO));
        semACaixa.put("codigosBarras", List.of(EAN_UNIDADE, EAN_CAIXA));

        atualizar(loja, id(criado), semACaixa)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.codigosBarras[1].codigo").value(EAN_CAIXA))
                .andExpect(jsonPath("$.embalagens.length()").value(1));
    }

    /** A embalagem de compra sai e outra ja existente passa a ser a de compra no mesmo PATCH. */
    @Test
    void embalagemDeCompraRemovidaEOutraMarcada() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));

        atualizar(loja, id(criado), comEmbalagens(loja, criado,
                embalagem(idDaEmbalagem(criado, 0), loja.unidade("CX"), "3", "209.90", true, EAN_CAIXA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.embalagens.length()").value(1))
                .andExpect(jsonPath("$.embalagens[0].deCompra").value(true));
    }

    /** Quantidade e preco mudam juntos: a linha do historico usa o rotulo de depois do salvamento. */
    @Test
    void historicoUsaORotuloNovo() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));
        UUID produto = id(criado);

        atualizar(loja, produto, comEmbalagens(loja, criado,
                embalagem(idDaEmbalagem(criado, 0), loja.unidade("CX"), "6", "399.90", false, EAN_CAIXA),
                embalagem(idDaEmbalagem(criado, 1), loja.unidade("FD"), "12", null, true, EAN_FARDO)))
                .andExpect(status().isOk());

        assertThat(historicoDasEmbalagens(produto)).containsExactly(
                "CX c/ 3 UN: null -> 209.90", "CX c/ 6 UN: 209.90 -> 399.90");
    }

    // ---------- Revisao da B3: lista, unicidade adiada, corrida e N+1 ----------

    @Test
    void itemNuloNaListaDa400() throws Exception {
        Loja loja = novaLoja();
        Map<String, Object> comNulo = produto(loja, "Com nulo", "UN", "10.00");
        comNulo.put("embalagens", Arrays.asList((Object) null));

        cadastrar(loja, comNulo)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("embalagens[0]"))
                .andExpect(jsonPath("$.campos[0].mensagem").value("Informe a embalagem."));
    }

    /** A CX c/ 3 existente vira CX c/ 6 e entra uma CX c/ 3 nova no mesmo PATCH (unicidade conferida no fim). */
    @Test
    void embalagemExistenteMudaDeQuantidadeEUmaNovaOcupaAAntiga() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));

        atualizar(loja, id(criado), comEmbalagens(loja, criado,
                embalagem(idDaEmbalagem(criado, 0), loja.unidade("CX"), "6", "399.90", false, EAN_CAIXA),
                embalagem(null, loja.unidade("CX"), "3", "209.90", false),
                embalagem(idDaEmbalagem(criado, 1), loja.unidade("FD"), "12", null, true, EAN_FARDO)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.embalagens[0].id").value(idDaEmbalagem(criado, 0).toString()))
                .andExpect(jsonPath("$.embalagens[0].rotulo").value("CX c/ 6 UN"))
                .andExpect(jsonPath("$.embalagens[1].rotulo").value("CX c/ 3 UN"));
    }

    /**
     * A conferencia antecipada da unicidade adiada recusa a repeticao ainda na
     * transacao, como {@code DataIntegrityViolationException} (409 generico).
     */
    @Test
    void conferenciaAntecipadaDaUnicidadeRecusaARepeticao() throws Exception {
        Loja loja = novaLoja();
        UUID produto = id(corpoDe(cadastrar(loja, produto(loja, "Nexgard", "UN", "89.90"))));
        TransactionTemplate transacao = new TransactionTemplate(gerenciadorDeTransacoes);

        assertThatThrownBy(() -> transacao.executeWithoutResult(status -> {
            for (int vez = 0; vez < 2; vez++) {
                jdbcTemplate.update("""
                        INSERT INTO produto_embalagens (uuid, empresa_id, produto_id, unidade_id, quantidade, ordem)
                        SELECT ?, p.empresa_id, p.id, u.id, 3, ?
                          FROM produtos p JOIN unidades_medida u ON u.empresa_id = p.empresa_id AND u.sigla = 'CX'
                         WHERE p.uuid = ?
                        """, UUID.randomUUID(), vez, produto);
            }
            produtoRepository.conferirUnicidadeDasEmbalagensAgora();
        })).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(contar("SELECT count(*) FROM produto_embalagens e JOIN produtos p ON p.id = e.produto_id"
                + " WHERE p.uuid = ?", produto)).isZero();
    }

    /**
     * Corrida real: dois cadastros simultaneos com o mesmo codigo numa
     * embalagem. Um grava (201) e o outro recebe o 409 com o dono, no campo da
     * lista da embalagem, nunca 500.
     */
    @Test
    void cadastrosSimultaneosComOMesmoCodigoNaEmbalagem() throws Exception {
        Loja loja = novaLoja();
        UUID un = UUID.fromString(loja.unidade("UN"));
        UUID cx = UUID.fromString(loja.unidade("CX"));
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            for (int rodada = 1; rodada <= RODADAS_CONCORRENTES; rodada++) {
                String codigo = "CAIXA-" + rodada;
                CyclicBarrier largada = new CyclicBarrier(2);
                Future<String> primeiro = executor.submit(cadastrarAoMesmoTempo(largada, loja, un, cx,
                        "Nexgard A" + rodada, codigo));
                Future<String> segundo = executor.submit(cadastrarAoMesmoTempo(largada, loja, un, cx,
                        "Nexgard B" + rodada, codigo));

                List<String> resultados = List.of(primeiro.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS),
                        segundo.get(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS));

                assertThat(resultados).as("rodada %d", rodada).contains("criado");
                String conflitoEsperado = "embalagens\\[0]\\.codigosBarras: Este código já está em uso na "
                        + "embalagem CX c/ 3 UN do produto Nexgard [AB]" + rodada + "\\.";
                assertThat(resultados).as("rodada %d", rodada)
                        .anySatisfy(resultado -> assertThat(resultado).matches(conflitoEsperado));
            }
        } finally {
            executor.shutdownNow();
        }
    }

    /** {@code "criado"} ou {@code "campo: mensagem"} do 409. Qualquer outro erro sobe e falha o teste. */
    private Callable<String> cadastrarAoMesmoTempo(CyclicBarrier largada, Loja loja, UUID un, UUID cx, String nome,
            String codigo) {
        return () -> {
            largada.await(ESPERA_MAXIMA_SEGUNDOS, TimeUnit.SECONDS);
            try {
                produtoService.cadastrarParaUsuario(loja.admin(), ProdutoRequestBuilder.comUnidade(un).nome(nome)
                        .embalagens(new EmbalagemRequest(null, cx, new BigDecimal("3"), null, false, List.of(codigo)))
                        .build());
                return "criado";
            } catch (ProdutoConflitoException conflito) {
                return conflito.campo().orElse("?") + ": " + conflito.getMessage();
            }
        };
    }

    /** O detalhe nao faz uma consulta por embalagem: 1 e 5 embalagens com codigos custam o mesmo. */
    @Test
    void detalheSemConsultaPorEmbalagem() throws Exception {
        Loja loja = novaLoja();
        Map<String, Object> uma = produto(loja, "Uma embalagem", "UN", "10.00");
        uma.put("embalagens", List.of(embalagem(null, loja.unidade("CX"), "3", null, false, "U-1")));
        Map<String, Object> cinco = produto(loja, "Cinco embalagens", "UN", "10.00");
        cinco.put("embalagens", List.of(
                embalagem(null, loja.unidade("CX"), "3", null, false, "C-1", "C-2"),
                embalagem(null, loja.unidade("FD"), "12", null, true, "F-1", "F-2"),
                embalagem(null, loja.unidade("PCT"), "6", null, false, "P-1", "P-2"),
                embalagem(null, loja.unidade("DZ"), "12", null, false, "D-1", "D-2"),
                embalagem(null, loja.unidade("CX"), "24", null, false, "X-1", "X-2")));
        UUID comUma = id(corpoDe(cadastrar(loja, uma)));
        UUID comCinco = id(corpoDe(cadastrar(loja, cinco)));

        long comandosComUma = comandosNoDetalhe(loja, comUma);
        long comandosComCinco = comandosNoDetalhe(loja, comCinco);

        assertThat(comandosComCinco).isEqualTo(comandosComUma);
    }

    private long comandosNoDetalhe(Loja loja, UUID produto) {
        Statistics estatisticas = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        estatisticas.clear();
        assertThat(produtoService.buscarPorIdParaUsuario(loja.admin(), produto).embalagens()).isNotEmpty();
        return estatisticas.getPrepareStatementCount();
    }

    // ---------- Fracao da unidade de venda ----------

    @Test
    void naoDesligaAFracaoDaUnidadeComEmbalagemFracionada() throws Exception {
        Loja loja = novaLoja();
        Map<String, Object> racao = produto(loja, "Ração a granel", "KG", "12.99");
        racao.put("embalagens", List.of(embalagem(null, loja.unidade("PCT"), "25.5", null, false)));
        cadastrar(loja, racao).andExpect(status().isCreated());
        UUID kg = UUID.fromString(loja.unidade("KG"));

        assertThatThrownBy(() -> unidadeService.atualizarParaUsuario(loja.admin(), kg,
                new UnidadeMedidaRequest("KG", "Quilograma", false)))
                .isInstanceOfSatisfying(RegraDeNegocioException.class,
                        erro -> assertThat(erro.campo()).contains("fracionada"))
                .hasMessage("Há embalagens com quantidade fracionada nesta unidade. Ajuste-as antes de desligar o "
                        + "fracionamento.");
    }

    /** UUID de embalagem de outra empresa no PATCH: 404, como qualquer id que nao e do produto (DEC-016). */
    @Test
    void embalagemDeOutraEmpresaNoPatch404() throws Exception {
        Loja loja = novaLoja();
        Loja outra = novaLoja();
        JsonNode daOutra = corpoDe(cadastrar(outra, nexgard(outra)));
        Map<String, Object> bravecto = produto(loja, "Bravecto", "UN", "150.00");
        JsonNode criado = corpoDe(cadastrar(loja, bravecto));

        atualizar(loja, id(criado), comEmbalagens(loja, criado,
                embalagem(idDaEmbalagem(daOutra, 0), loja.unidade("CX"), "3", null, false)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Embalagem não encontrada."));
        assertThat(contar("SELECT count(*) FROM produto_embalagens e JOIN produtos p ON p.id = e.produto_id"
                + " WHERE p.uuid = ?", id(daOutra))).isEqualTo(2);
    }

    @Test
    void embalagemInteiraNaoImpedeDesligarAFracao() throws Exception {
        Loja loja = novaLoja();
        Map<String, Object> racao = produto(loja, "Ração 25kg", "KG", "12.99");
        racao.put("embalagens", List.of(embalagem(null, loja.unidade("PCT"), "25", null, false)));
        cadastrar(loja, racao).andExpect(status().isCreated());

        assertThat(unidadeService.atualizarParaUsuario(loja.admin(), UUID.fromString(loja.unidade("KG")),
                new UnidadeMedidaRequest("KG", "Quilograma", false)).fracionada()).isFalse();
    }

    // ---------- Conflitos de codigo ----------

    @Test
    void codigoDaEmbalagemIgualAoDaUnidadeDeOutroProduto409() throws Exception {
        Loja loja = novaLoja();
        Map<String, Object> arroz = produto(loja, "Arroz", "UN", "10.00");
        arroz.put("codigosBarras", List.of(EAN_CAIXA));
        cadastrar(loja, arroz).andExpect(status().isCreated());

        cadastrar(loja, nexgard(loja))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(
                        "O código de barras " + EAN_CAIXA + " já está cadastrado no produto \"Arroz\"."))
                .andExpect(jsonPath("$.campos[0].campo").value("embalagens[0].codigosBarras"));
    }

    @Test
    void codigoIgualAoDeEmbalagemDeOutroProduto409ComORotulo() throws Exception {
        Loja loja = novaLoja();
        cadastrar(loja, nexgard(loja)).andExpect(status().isCreated());
        Map<String, Object> bravecto = produto(loja, "Bravecto", "UN", "150.00");
        bravecto.put("codigosBarras", List.of(EAN_CAIXA));

        cadastrar(loja, bravecto)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(
                        "Este código já está em uso na embalagem CX c/ 3 UN do produto Nexgard Combo."))
                .andExpect(jsonPath("$.campos[0].campo").value("codigosBarras"));
    }

    // ---------- Review Focus 1: codigo que muda de lugar no mesmo salvamento ----------

    @Test
    void codigoMovidoDaUnidadeParaAEmbalagemEEntreEmbalagens() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));
        UUID produto = id(criado);
        UUID caixa = idDaEmbalagem(criado, 0);
        UUID fardo = idDaEmbalagem(criado, 1);

        Map<String, Object> daUnidadeParaACaixa = comEmbalagens(loja, criado,
                embalagem(caixa, loja.unidade("CX"), "3", "209.90", false, EAN_CAIXA, EAN_UNIDADE),
                embalagem(fardo, loja.unidade("FD"), "12", null, true, EAN_FARDO));
        daUnidadeParaACaixa.put("codigosBarras", List.of());
        atualizar(loja, produto, daUnidadeParaACaixa)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.codigosBarras.length()").value(0))
                .andExpect(jsonPath("$.embalagens[0].codigosBarras.length()").value(2));

        Map<String, Object> daCaixaParaOFardo = comEmbalagens(loja, criado,
                embalagem(caixa, loja.unidade("CX"), "3", "209.90", false, EAN_CAIXA),
                embalagem(fardo, loja.unidade("FD"), "12", null, true, EAN_FARDO, EAN_UNIDADE));
        daCaixaParaOFardo.put("codigosBarras", List.of());
        atualizar(loja, produto, daCaixaParaOFardo)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.embalagens[1].codigosBarras[1].codigo").value(EAN_UNIDADE));

        Map<String, Object> deVoltaParaAUnidade = comEmbalagens(loja, criado,
                embalagem(caixa, loja.unidade("CX"), "3", "209.90", false, EAN_CAIXA),
                embalagem(fardo, loja.unidade("FD"), "12", null, true, EAN_FARDO));
        deVoltaParaAUnidade.put("codigosBarras", List.of(EAN_UNIDADE));
        atualizar(loja, produto, deVoltaParaAUnidade)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.codigosBarras[0].codigo").value(EAN_UNIDADE));
    }

    @Test
    void embalagemRemovidaComCodigoQueVaiParaUmaNova() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));

        atualizar(loja, id(criado), comEmbalagens(loja, criado,
                embalagem(null, loja.unidade("PCT"), "6", null, false, EAN_CAIXA),
                embalagem(idDaEmbalagem(criado, 1), loja.unidade("FD"), "12", null, true, EAN_FARDO)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.embalagens[0].rotulo").value("PCT c/ 6 UN"))
                .andExpect(jsonPath("$.embalagens[0].codigosBarras[0].codigo").value(EAN_CAIXA));
    }

    // ---------- Review Focus 2: embalagem trocada no mesmo salvamento ----------

    @Test
    void embalagemRemovidaERecriadaIgual() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));

        atualizar(loja, id(criado), comEmbalagens(loja, criado,
                embalagem(null, loja.unidade("CX"), "3", "209.90", false, EAN_CAIXA),
                embalagem(null, loja.unidade("FD"), "12", null, true, EAN_FARDO)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.embalagens.length()").value(2))
                .andExpect(jsonPath("$.embalagens[0].rotulo").value("CX c/ 3 UN"));
    }

    @Test
    void duasEmbalagensTrocamUnidadeQuantidadeEMarcaDeCompra() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));
        UUID caixa = idDaEmbalagem(criado, 0);
        UUID fardo = idDaEmbalagem(criado, 1);

        atualizar(loja, id(criado), comEmbalagens(loja, criado,
                embalagem(caixa, loja.unidade("FD"), "12", "209.90", true, EAN_CAIXA),
                embalagem(fardo, loja.unidade("CX"), "3", null, false, EAN_FARDO)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.embalagens[0].id").value(caixa.toString()))
                .andExpect(jsonPath("$.embalagens[0].rotulo").value("FD c/ 12 UN"))
                .andExpect(jsonPath("$.embalagens[0].deCompra").value(true))
                .andExpect(jsonPath("$.embalagens[1].rotulo").value("CX c/ 3 UN"))
                .andExpect(jsonPath("$.embalagens[1].deCompra").value(false));
    }

    // ---------- Review Focus 3: troca da unidade de venda ----------

    @Test
    void unidadeDeVendaFracionadaTrocadaPorUnidadeInteira400() throws Exception {
        Loja loja = novaLoja();
        Map<String, Object> racao = produto(loja, "Ração a granel", "KG", "12.99");
        racao.put("embalagens", List.of(embalagem(null, loja.unidade("PCT"), "25.5", null, false)));
        JsonNode criado = corpoDe(cadastrar(loja, racao));
        assertThat(criado.at("/embalagens/0/rotulo").asText()).isEqualTo("PCT c/ 25,5 KG");
        assertThat(criado.at("/embalagens/0/precoEfetivo").decimalValue()).isEqualByComparingTo("331.25");

        Map<String, Object> emUnidades = comEmbalagens(loja, criado,
                embalagem(idDaEmbalagem(criado, 0), loja.unidade("PCT"), "25.5", null, false));
        emUnidades.put("unidadeId", loja.unidade("UN"));
        erro(atualizar(loja, id(criado), emUnidades), 400,
                "UN não aceita quantidade fracionada. Informe um número inteiro.", "embalagens[0].quantidade");

        Map<String, Object> semLista = produto(loja, "Ração a granel", "UN", "12.99");
        erro(atualizar(loja, id(criado), semLista), 400,
                "UN não aceita quantidade fracionada. Informe um número inteiro.", "embalagens[0].quantidade");
    }

    @Test
    void unidadeDeVendaTrocadaParaADaEmbalagem400() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));
        Map<String, Object> emCaixas = comEmbalagens(loja, criado,
                embalagem(idDaEmbalagem(criado, 0), loja.unidade("CX"), "3", "209.90", false, EAN_CAIXA));
        emCaixas.put("unidadeId", loja.unidade("CX"));

        erro(atualizar(loja, id(criado), emCaixas), 400,
                "A embalagem precisa de uma unidade diferente da unidade de venda (CX).", "embalagens[0].unidadeId");
    }

    // ---------- Review Focus 4: sem custo e preco minimo ----------

    @Test
    void semCustoAMargemEoMarkupVemNulos() throws Exception {
        Loja loja = novaLoja();
        Map<String, Object> semCusto = nexgard(loja);
        semCusto.remove("custo");

        cadastrar(loja, semCusto)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.embalagens[0].custo").doesNotExist())
                .andExpect(jsonPath("$.embalagens[0].margem").doesNotExist())
                .andExpect(jsonPath("$.embalagens[0].markup").doesNotExist());
    }

    @Test
    void precoIgualAQuantidadeVezesOMinimoPassaEAbaixoDa400() throws Exception {
        Loja loja = novaLoja();
        Map<String, Object> noMinimo = produto(loja, "Nexgard", "UN", "89.90");
        noMinimo.put("precoMinimo", "70.00");
        noMinimo.put("embalagens", List.of(embalagem(null, loja.unidade("CX"), "3", "210.00", false)));
        cadastrar(loja, noMinimo).andExpect(status().isCreated());

        Map<String, Object> abaixo = produto(loja, "Nexgard 2", "UN", "89.90");
        abaixo.put("precoMinimo", "70.00");
        abaixo.put("embalagens", List.of(embalagem(null, loja.unidade("CX"), "3", "209.99", false)));
        erro(cadastrar(loja, abaixo), 400,
                "O preço da embalagem dá R$ 69,99 por UN, abaixo do preço mínimo (R$ 70,00).", "embalagens[0].preco");
    }

    // ---------- Validacao da API ----------

    @Test
    void limitesDeEmbalagensEDeCodigosPeloBeanValidation() throws Exception {
        Loja loja = novaLoja();
        Map<String, Object> onze = produto(loja, "Muitas", "UN", "10.00");
        List<Map<String, Object>> embalagens = new ArrayList<>();
        for (int quantidade = 2; quantidade <= 12; quantidade++) {
            embalagens.add(embalagem(null, loja.unidade("CX"), String.valueOf(quantidade), null, false));
        }
        onze.put("embalagens", embalagens);
        cadastrar(loja, onze)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("embalagens"))
                .andExpect(jsonPath("$.campos[0].mensagem").value("Informe no máximo 10 embalagens."));

        Map<String, Object> seisCodigos = produto(loja, "Seis codigos", "UN", "10.00");
        seisCodigos.put("embalagens", List.of(embalagem(null, loja.unidade("CX"), "3", null, false,
                "A1", "A2", "A3", "A4", "A5", "A6")));
        cadastrar(loja, seisCodigos)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value("embalagens[0].codigosBarras"))
                .andExpect(jsonPath("$.campos[0].mensagem")
                        .value("Informe no máximo 5 códigos de barras por embalagem."));
    }

    // ---------- Acesso e isolamento ----------

    @Test
    void idDeEmbalagemDeOutroProduto404() throws Exception {
        Loja loja = novaLoja();
        JsonNode nexgard = corpoDe(cadastrar(loja, nexgard(loja)));
        Map<String, Object> bravecto = produto(loja, "Bravecto", "UN", "150.00");
        JsonNode criado = corpoDe(cadastrar(loja, bravecto));

        Map<String, Object> roubada = comEmbalagens(loja, criado,
                embalagem(idDaEmbalagem(nexgard, 0), loja.unidade("CX"), "3", null, false));
        atualizar(loja, id(criado), roubada)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Embalagem não encontrada."));
    }

    @Test
    void operadorNaoAlteraEmbalagens() throws Exception {
        Loja loja = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));

        mockMvc.perform(patch("/api/produtos/" + id(criado))
                        .header("Authorization", loja.tokenDoOperador())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(nexgard(loja))))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/produtos/" + id(criado)).header("Authorization", loja.tokenDoOperador()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.embalagens.length()").value(2));
    }

    @Test
    void outraEmpresaNaoVeNemUsaAEmbalagem() throws Exception {
        Loja loja = novaLoja();
        Loja outra = novaLoja();
        JsonNode criado = corpoDe(cadastrar(loja, nexgard(loja)));

        mockMvc.perform(get("/api/produtos/" + id(criado)).header("Authorization", outra.tokenDoAdmin()))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/produtos").param("busca", EAN_CAIXA).header("Authorization", outra.tokenDoAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(0));
        Map<String, Object> comUnidadeDaOutra = produto(outra, "Da outra", "UN", "10.00");
        comUnidadeDaOutra.put("embalagens", List.of(embalagem(null, loja.unidade("CX"), "3", null, false)));
        cadastrar(outra, comUnidadeDaOutra).andExpect(status().isNotFound());
        // O mesmo codigo da embalagem e livre em outra empresa.
        Map<String, Object> mesmoCodigo = produto(outra, "Outro Nexgard", "UN", "10.00");
        mesmoCodigo.put("codigosBarras", List.of(EAN_CAIXA));
        cadastrar(outra, mesmoCodigo).andExpect(status().isCreated());
    }

    // ---------- Promocao ----------

    @Test
    void embalagemSemPrecoSegueAPromocaoVigenteDaUnidade() throws Exception {
        Loja loja = novaLoja();
        LocalDate hoje = SituacaoPromocao.hoje(relogio);
        Map<String, Object> vigente = produto(loja, "Em promoção", "UN", "89.90");
        vigente.put("promocao", Map.of("preco", "79.90", "inicio", hoje.minusDays(1).toString(),
                "fim", hoje.plusDays(1).toString()));
        vigente.put("embalagens", List.of(embalagem(null, loja.unidade("CX"), "3", null, false),
                embalagem(null, loja.unidade("FD"), "12", "900.00", false)));
        cadastrar(loja, vigente)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.embalagens[0].precoEfetivo").value(239.70))
                .andExpect(jsonPath("$.embalagens[0].origemPreco").value("PROMOCAO_DA_UNIDADE"))
                .andExpect(jsonPath("$.embalagens[1].precoEfetivo").value(900.00))
                .andExpect(jsonPath("$.embalagens[1].origemPreco").value("PROPRIO"));

        Map<String, Object> vencida = produto(loja, "Promoção vencida", "UN", "89.90");
        vencida.put("promocao", Map.of("preco", "79.90", "inicio", hoje.minusDays(5).toString(),
                "fim", hoje.minusDays(1).toString()));
        vencida.put("embalagens", List.of(embalagem(null, loja.unidade("CX"), "3", null, false)));
        cadastrar(loja, vencida)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.embalagens[0].precoEfetivo").value(269.70))
                .andExpect(jsonPath("$.embalagens[0].origemPreco").value("UNIDADE"));
    }

    // ---------- Busca e listagem ----------

    @Test
    void buscaPeloCodigoDaEmbalagemAchaOProdutoEAListaTrazAsEmbalagens() throws Exception {
        Loja loja = novaLoja();
        cadastrar(loja, nexgard(loja)).andExpect(status().isCreated());
        cadastrar(loja, produto(loja, "Arroz", "UN", "10.00")).andExpect(status().isCreated());

        mockMvc.perform(get("/api/produtos").param("busca", EAN_CAIXA).header("Authorization", loja.tokenDoAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(1))
                .andExpect(jsonPath("$.itens[0].nome").value("Nexgard Combo"))
                .andExpect(jsonPath("$.itens[0].codigosBarras.length()").value(1))
                .andExpect(jsonPath("$.itens[0].codigosBarras[0].codigo").value(EAN_UNIDADE))
                .andExpect(jsonPath("$.itens[0].embalagens.length()").value(2))
                .andExpect(jsonPath("$.itens[0].embalagens[0].codigosBarras[0].codigo").value(EAN_CAIXA))
                .andExpect(jsonPath("$.itens[0].embalagens[1].unidade.sigla").value("FD"));
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private record Loja(Long admin, Long operador, String tokenDoAdmin, String tokenDoOperador,
            List<UnidadeMedidaResponse> unidades) {

        String unidade(String sigla) {
            return unidades.stream()
                    .filter(unidade -> unidade.sigla().equals(sigla))
                    .map(unidade -> unidade.id().toString())
                    .findFirst()
                    .orElseThrow();
        }
    }

    /** Nexgard Combo: UN a 89,90 com custo 50, CX c/ 3 a 209,90 e FD c/ 12 (de compra, sem preco). */
    private static Map<String, Object> nexgard(Loja loja) {
        Map<String, Object> corpo = produto(loja, "Nexgard Combo", "UN", "89.90");
        corpo.put("custo", "50.00");
        corpo.put("codigosBarras", List.of(EAN_UNIDADE));
        corpo.put("embalagens", List.of(
                embalagem(null, loja.unidade("CX"), "3", "209.90", false, EAN_CAIXA),
                embalagem(null, loja.unidade("FD"), "12", null, true, EAN_FARDO)));
        return corpo;
    }

    private static Map<String, Object> produto(Loja loja, String nome, String sigla, String precoVenda) {
        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("nome", nome);
        corpo.put("unidadeId", loja.unidade(sigla));
        corpo.put("precoVenda", precoVenda);
        corpo.put("controlaEstoque", true);
        return corpo;
    }

    /** O Nexgard do cadastro com outra lista de embalagens (e os demais campos iguais). */
    private static Map<String, Object> comEmbalagens(Loja loja, JsonNode criado, Map<?, ?>... embalagens) {
        Map<String, Object> corpo = produto(loja, criado.get("nome").asText(), criado.at("/unidade/sigla").asText(),
                criado.get("precoVenda").decimalValue().toPlainString());
        if (!criado.get("custo").isNull()) {
            corpo.put("custo", criado.get("custo").decimalValue().toPlainString());
        }
        corpo.put("embalagens", Arrays.asList(embalagens));
        return corpo;
    }

    private static Map<String, Object> embalagem(UUID id, String unidadeId, String quantidade, String preco,
            boolean deCompra, String... codigos) {
        Map<String, Object> embalagem = new LinkedHashMap<>();
        if (id != null) {
            embalagem.put("id", id.toString());
        }
        embalagem.put("unidadeId", unidadeId);
        embalagem.put("quantidade", quantidade);
        if (preco != null) {
            embalagem.put("preco", preco);
        }
        embalagem.put("deCompra", deCompra);
        embalagem.put("codigosBarras", List.of(codigos));
        return embalagem;
    }

    private ResultActions cadastrar(Loja loja, Map<String, Object> corpo) throws Exception {
        return mockMvc.perform(post("/api/produtos")
                .header("Authorization", loja.tokenDoAdmin())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(corpo)));
    }

    private ResultActions atualizar(Loja loja, UUID produto, Map<String, Object> corpo) throws Exception {
        return mockMvc.perform(patch("/api/produtos/" + produto)
                .header("Authorization", loja.tokenDoAdmin())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(corpo)));
    }

    private ResultActions historico(Loja loja, UUID produto) throws Exception {
        return mockMvc.perform(get("/api/produtos/" + produto + "/historico-precos")
                .header("Authorization", loja.tokenDoAdmin()));
    }

    /** Status, mensagem ({@code null} = nao confere) e o campo no primeiro item de {@code campos}. */
    private static void erro(ResultActions resposta, int status, String mensagem, String campo) throws Exception {
        resposta.andExpect(status().is(status))
                .andExpect(jsonPath("$.campos[0].campo").value(campo));
        if (mensagem != null) {
            resposta.andExpect(jsonPath("$.mensagem").value(mensagem));
        }
    }

    private JsonNode corpoDe(ResultActions resposta) throws Exception {
        String corpo = resposta.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(corpo);
    }

    private static UUID id(JsonNode produto) {
        return UUID.fromString(produto.get("id").asText());
    }

    private static UUID idDaEmbalagem(JsonNode produto, int indice) {
        return UUID.fromString(produto.at("/embalagens/" + indice + "/id").asText());
    }

    /** Id interno da linha do codigo no produto (prova que a linha foi mantida, nao recriada). */
    private Long idDoCodigo(UUID produto, String codigo) {
        return jdbcTemplate.queryForObject("""
                SELECT c.id FROM produto_codigos_barras c JOIN produtos p ON p.id = c.produto_id
                 WHERE p.uuid = ? AND c.codigo = ?
                """, Long.class, produto, codigo);
    }

    /** {@code atualizado_em} gravado, como texto (com microssegundos), ou {@code null}. */
    private String atualizadoEm(UUID produto) {
        return jdbcTemplate.queryForObject("SELECT atualizado_em::text FROM produtos WHERE uuid = ?", String.class,
                produto);
    }

    private long contar(String sql, Object... parametros) {
        return jdbcTemplate.queryForObject(sql, Long.class, parametros);
    }

    /** Linhas de PRECO_EMBALAGEM do produto, da mais antiga para a mais nova: "rotulo: anterior -> novo". */
    private List<String> historicoDasEmbalagens(UUID produto) {
        return jdbcTemplate.queryForList("""
                SELECT h.embalagem_rotulo || ': ' || coalesce(h.valor_anterior::text, 'null') || ' -> '
                       || coalesce(h.valor_novo::text, 'null')
                  FROM produto_historico_precos h JOIN produtos p ON p.id = h.produto_id
                 WHERE p.uuid = ? AND h.campo = 'PRECO_EMBALAGEM'
                 ORDER BY h.id
                """, String.class, produto);
    }

    /** Empresa FISICA com as unidades padrao, um ADMIN e um OPERADOR; nomes unicos por teste. */
    private Loja novaLoja() {
        String sufixo = String.valueOf(SEQUENCIA.incrementAndGet());
        String nome = "Empresa Embalagens " + sufixo;
        Empresa empresa = new Empresa(nome);
        empresa.atualizarCadastro(nome, "1133224455", "contato" + sufixo + "@embalagens.test", TipoPessoa.FISICA,
                null, null, null,
                new RepresentanteLegal("Representante " + sufixo, "11144477735", "11987654321",
                        "rep" + sufixo + "@embalagens.test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        Empresa gravada = empresaRepository.saveAndFlush(empresa);
        unidadeService.criarPadroes(gravada);
        Usuario admin = usuarioRepository.saveAndFlush(new Usuario(gravada, "Admin",
                "admin" + sufixo + "@embalagens.test", "hash-irrelevante-no-teste", "ADMIN"));
        Usuario operador = usuarioRepository.saveAndFlush(new Usuario(gravada, "Operador",
                "operador" + sufixo + "@embalagens.test", "hash-irrelevante-no-teste", "OPERADOR"));
        return new Loja(admin.getId(), operador.getId(), "Bearer " + jwtService.gerarToken(admin),
                "Bearer " + jwtService.gerarToken(operador), unidadeService.listarParaUsuario(admin.getId(), null));
    }
}
