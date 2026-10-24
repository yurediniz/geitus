package com.geitus.app.catalog;

import static com.geitus.app.catalog.ProdutoRequestBuilder.comUnidade;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import org.assertj.core.api.ListAssert;
import org.hibernate.exception.ConstraintViolationException;
import org.assertj.core.api.ThrowingConsumer;
import org.assertj.core.groups.Tuple;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.postgresql.util.PSQLException;
import org.postgresql.util.ServerErrorMessage;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.categoria.CategoriaService;
import com.geitus.app.catalog.dto.CodigoBarrasResponse;
import com.geitus.app.catalog.dto.HistoricoPrecoResponse;
import com.geitus.app.catalog.dto.PaginaResponse;
import com.geitus.app.catalog.dto.ProdutoRequest;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.listagem.ConsultaDeProdutos;
import com.geitus.app.catalog.listagem.EstoqueFiltro;
import com.geitus.app.catalog.listagem.FiltroDeProdutos;
import com.geitus.app.catalog.listagem.OrdemDeProdutos;
import com.geitus.app.catalog.listagem.PaginaDeIds;
import com.geitus.app.catalog.listagem.ParametrosDaListagem;
import com.geitus.app.catalog.listagem.StatusFiltro;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.shared.numeracao.Numerador;
import com.geitus.app.shared.numeracao.TipoNumeracao;

/**
 * Testa as regras do {@link ProdutoService}: validacoes de cadastro/atualizacao
 * (incluindo os campos cadastrais da V4 e as regras cruzadas), normalizacao de
 * texto, isolamento por empresa (DEC-016), os vinculos com unidade de venda,
 * categoria e unidade de compra (docs/modules/categorias-e-unidades.md, 5.1) e a
 * identificacao da Fase B (codigos de barras, nome curto, SKU sugerido,
 * sugestoes e exclusao — docs/modules/produtos-identificacao-e-formulario.md, 4).
 */
@ExtendWith(MockitoExtension.class)
class ProdutoServiceTest {

    private static final Long EMPRESA_ID = 1L;
    private static final Long PRODUTO_ID = 5L;
    private static final Long ID_USUARIO = 9L;
    private static final String EAN13_VALIDO = "7891000315507";
    private static final String EAN13_DIGITO_INVALIDO = "7891000315508";
    private static final String EAN8_VALIDO = "96385074";
    /**
     * 08/03/2020 12:00 em Sao Paulo: longe da data real, para que nenhum teste
     * passe por acaso lendo o relogio do sistema em vez do injetado.
     */
    private static final Clock RELOGIO = Clock.fixed(Instant.parse("2020-03-08T15:00:00Z"),
            ZoneId.of("America/Sao_Paulo"));
    private static final LocalDate INICIO_PROMOCAO = LocalDate.of(2020, 3, 1);
    private static final LocalDate FIM_PROMOCAO = LocalDate.of(2020, 3, 15);

    @Mock
    private ProdutoRepository produtoRepository;

    @Mock
    private EmpresaRepository empresaRepository;

    @Mock
    private UsuarioRepository usuarioRepository;

    @Mock
    private UnidadeMedidaService unidadeService;

    @Mock
    private CategoriaService categoriaService;

    @Mock
    private HistoricoPrecoRepository historicoPrecoRepository;

    @Mock
    private UsoDoProdutoNoEstoque usoNoEstoque;

    @Mock
    private RegistroDeEstoqueInicial registroDeEstoqueInicial;

    @Mock
    private ConsultaDeProdutos consultaDeProdutos;

    @Mock
    private Numerador numerador;

    @Mock
    private TamanhoDoCodigoNaEtiqueta tamanhoDoCodigoNaEtiqueta;

    private ProdutoService produtoService;

    private Empresa empresa;
    private UnidadeMedida un;
    private UUID produtoUuid;

    @BeforeEach
    void setUp() {
        produtoService = new ProdutoService(produtoRepository, empresaRepository, usuarioRepository,
                unidadeService, categoriaService, historicoPrecoRepository,
                new HistoricoDePrecos(historicoPrecoRepository), new ValidadorDeCodigosDeBarras(produtoRepository),
                new EmbalagensDoProduto(unidadeService, new ValidadorDeCodigosDeBarras(produtoRepository)),
                usoNoEstoque, registroDeEstoqueInicial,
                consultaDeProdutos, numerador, tamanhoDoCodigoNaEtiqueta, RELOGIO);
        empresa = empresaComId(EMPRESA_ID);
        un = unidade(10L, empresa, "UN");
    }

    // ---------- Fixtures ----------

    private static Empresa empresaComId(Long id) {
        Empresa empresa = new Empresa("Empresa " + id);
        ReflectionTestUtils.setField(empresa, "id", id);
        return empresa;
    }

    private static UnidadeMedida unidade(Long id, Empresa empresa, String sigla) {
        UnidadeMedida unidade = new UnidadeMedida(empresa, sigla, "Unidade " + sigla, false);
        ReflectionTestUtils.setField(unidade, "id", id);
        return unidade;
    }

    private static Categoria categoria(Long id, Empresa empresa, Categoria pai, String nome) {
        Categoria categoria = new Categoria(empresa, pai, nome);
        ReflectionTestUtils.setField(categoria, "id", id);
        return categoria;
    }

    private ProdutoTesteBuilder existente() {
        return ProdutoTesteBuilder.produto(empresa, un).id(PRODUTO_ID).nome("Produto Existente");
    }

    /** Registra o produto como o encontrado pelo UUID dentro da empresa. */
    /**
     * Registra o produto como o encontrado pelo UUID dentro da empresa, tanto
     * na busca simples quanto na busca com trava da edicao. Os dois stubs sao
     * {@code lenient}: cada operacao usa so um deles (a escolha e conferida em
     * {@link #atualizarBuscaOProdutoComTravaDeEscrita()}).
     */
    private Produto produtoExistente(ProdutoTesteBuilder builder) {
        Produto produto = builder.build();
        produtoUuid = produto.getUuid();
        lenient().when(produtoRepository.findByUuidAndEmpresa_Id(produtoUuid, EMPRESA_ID))
                .thenReturn(Optional.of(produto));
        lenient().when(produtoRepository.buscarPorUuidParaAtualizar(produtoUuid, EMPRESA_ID))
                .thenReturn(Optional.of(produto));
        return produto;
    }

    private Produto produtoExistente() {
        return produtoExistente(existente());
    }

    private void unidadeDaEmpresa(UnidadeMedida unidade) {
        when(unidadeService.buscarDaEmpresa(EMPRESA_ID, unidade.getUuid())).thenReturn(unidade);
    }

    private void categoriaDaEmpresa(Categoria categoria) {
        when(categoriaService.buscarDaEmpresa(EMPRESA_ID, categoria.getUuid())).thenReturn(categoria);
    }

    private void arvoreDaEmpresa(Categoria... categorias) {
        when(categoriaService.arvoreDaEmpresa(EMPRESA_ID)).thenReturn(CategoriaArvore.de(List.of(categorias)));
    }

    private void cadastroPermitido() {
        unidadeDaEmpresa(un);
        when(empresaRepository.findById(EMPRESA_ID)).thenReturn(Optional.of(empresa));
        salvamentoDevolveOProduto();
    }

    private void edicaoPermitida() {
        unidadeDaEmpresa(un);
        salvamentoDevolveOProduto();
    }

    private void salvamentoDevolveOProduto() {
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));
    }

    private ProdutoRequestBuilder requestComUN() {
        return comUnidade(un.getUuid());
    }

    private Produto cadastrar(ProdutoRequest request) {
        return produtoService.cadastrar(ID_USUARIO, EMPRESA_ID, request);
    }

    private Produto atualizar(ProdutoRequest request) {
        return produtoService.atualizarDadosBasicos(ID_USUARIO, EMPRESA_ID, produtoUuid, request);
    }

    private static List<String> codigosDe(Produto produto) {
        return produto.getCodigosBarras().stream().map(ProdutoCodigoBarras::getCodigo).toList();
    }

    /** Campo que a excecao de regra/conflito informa (vai para {@code campos} na resposta). */
    private static ThrowingConsumer<Throwable> noCampo(String campo) {
        return erro -> assertThat(erro instanceof RegraDeNegocioException regra
                ? regra.campo()
                : ((ProdutoConflitoException) erro).campo()).contains(campo);
    }

    private static List<FormatoCodigoBarras> formatosDe(Produto produto) {
        return produto.getCodigosBarras().stream().map(ProdutoCodigoBarras::getFormato).toList();
    }

    // ---------- Cadastro: regras basicas ----------

    @Test
    void cadastrarProdutoValidoDeveSalvar() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().nome("Arroz 5kg").precoVenda("25.90").custo("18.00")
                .estoqueMinimo("2").codigosBarras(EAN13_VALIDO).sku("SKU-1").build());

        assertThat(produto.getNome()).isEqualTo("Arroz 5kg");
        assertThat(produto.getEmpresaId()).isEqualTo(EMPRESA_ID);
        assertThat(produto.getUuid()).isNotNull();
        assertThat(produto.getUnidade()).isSameAs(un);
        assertThat(produto.getCategoria()).isNull();
        assertThat(produto.isAtivo()).isTrue();
        assertThat(codigosDe(produto)).containsExactly(EAN13_VALIDO);
        assertThat(formatosDe(produto)).containsExactly(FormatoCodigoBarras.EAN13);
        verify(produtoRepository).save(any(Produto.class));
    }

    @Test
    void cadastrarComNomeVazioDeveFalhar() {
        assertThatThrownBy(() -> cadastrar(requestComUN().nome("   ").build()))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComPrecoVendaNegativoDeveFalhar() {
        assertThatThrownBy(() -> cadastrar(requestComUN().precoVenda("-1").build()))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComCustoNegativoDeveFalhar() {
        assertThatThrownBy(() -> cadastrar(requestComUN().custo("-0.01").build()))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComEstoqueMinimoNegativoDeveFalhar() {
        assertThatThrownBy(() -> cadastrar(requestComUN().estoqueMinimo("-1").build()))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarSemUnidadeDeveFalhar() {
        assertThatThrownBy(() -> cadastrar(requestComUN().unidadeId(null).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Unidade é obrigatória.");

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComSkuDuplicadoNaMesmaEmpresaDeveFalhar() {
        when(produtoRepository.existsBySkuAndEmpresa_Id("SKU-1", EMPRESA_ID)).thenReturn(true);

        assertThatThrownBy(() -> cadastrar(requestComUN().sku("SKU-1").build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .satisfies(noCampo("sku"));

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComMesmoSkuEmEmpresasDiferentesDevePermitir() {
        // O SKU "SKU-1" existe em outra empresa (1), mas o cadastro e feito na
        // empresa 2: a checagem de unicidade deve considerar apenas a empresa
        // informada, entao a consulta para a empresa 2 retorna "nao existe".
        Empresa empresa2 = empresaComId(2L);
        UnidadeMedida unDaEmpresa2 = unidade(20L, empresa2, "UN");
        when(produtoRepository.existsBySkuAndEmpresa_Id("SKU-1", 2L)).thenReturn(false);
        when(unidadeService.buscarDaEmpresa(2L, unDaEmpresa2.getUuid())).thenReturn(unDaEmpresa2);
        when(empresaRepository.findById(2L)).thenReturn(Optional.of(empresa2));
        salvamentoDevolveOProduto();

        Produto produto = produtoService.cadastrar(ID_USUARIO, 2L,
                comUnidade(unDaEmpresa2.getUuid()).sku("SKU-1").build());

        assertThat(produto.getSku()).isEqualTo("SKU-1");
        assertThat(produto.getEmpresaId()).isEqualTo(2L);
        verify(produtoRepository).existsBySkuAndEmpresa_Id("SKU-1", 2L);
        verify(produtoRepository, never()).existsBySkuAndEmpresa_Id(eq("SKU-1"), eq(1L));
    }

    @Test
    void cadastrarSemSkuESemCodigosDevePermitir() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().nome("Produto Sem Codigos").codigosBarras((List<String>) null)
                .build());

        assertThat(produto.getSku()).isNull();
        assertThat(produto.getCodigosBarras()).isEmpty();
        verify(produtoRepository, never()).existsBySkuAndEmpresa_Id(any(), anyLong());
        verify(produtoRepository, never()).produtoComCodigo(any(), any(), any());
    }

    // ---------- Atualizacao: regras basicas ----------

    /**
     * A edicao trava a linha do produto (SELECT ... FOR UPDATE) antes de ler o
     * custo e o preco anteriores: duas edicoes concorrentes nao podem gravar o
     * mesmo valor anterior e quebrar a cadeia valor_anterior -> valor_novo.
     */
    @Test
    void atualizarBuscaOProdutoComTravaDeEscrita() {
        produtoExistente();
        edicaoPermitida();

        atualizar(requestComUN().nome("Outro nome").build());

        verify(produtoRepository).buscarPorUuidParaAtualizar(produtoUuid, EMPRESA_ID);
        verify(produtoRepository, never()).findByUuidAndEmpresa_Id(any(), anyLong());
    }

    /** Inativar e reativar travam a linha: nao sobrescrevem uma edicao concorrente (lost update). */
    @Test
    void inativarEReativarTravamOProduto() {
        produtoExistente();
        salvamentoDevolveOProduto();

        produtoService.inativar(EMPRESA_ID, produtoUuid);
        produtoService.reativar(EMPRESA_ID, produtoUuid);

        verify(produtoRepository, times(2)).buscarPorUuidParaAtualizar(produtoUuid, EMPRESA_ID);
        verify(produtoRepository, never()).findByUuidAndEmpresa_Id(any(), anyLong());
    }

    @Test
    void atualizarProdutoDeOutraEmpresaDeveFalhar() {
        produtoUuid = UUID.randomUUID();
        when(produtoRepository.buscarPorUuidParaAtualizar(produtoUuid, EMPRESA_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> atualizar(requestComUN().nome("Novo Nome").build()))
                .isInstanceOf(ProdutoNaoEncontradoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void atualizarProdutoDentroDaEmpresaCorretaDeveAlterarDados() {
        produtoExistente();
        UnidadeMedida kg = unidade(11L, empresa, "KG");
        unidadeDaEmpresa(kg);
        salvamentoDevolveOProduto();

        Produto atualizado = atualizar(comUnidade(kg.getUuid()).nome("Nome Atualizado").precoVenda("30.00")
                .custo("20.00").estoqueMinimo("1").build());

        assertThat(atualizado.getNome()).isEqualTo("Nome Atualizado");
        assertThat(atualizado.getPrecoVenda()).isEqualByComparingTo("30.00");
        assertThat(atualizado.getUnidade()).isSameAs(kg);
    }

    @Test
    void atualizarComSkuJaUsadoPorOutroProdutoDaMesmaEmpresaDeveFalhar() {
        produtoExistente(existente().sku("SKU-PROPRIO"));
        when(produtoRepository.existsBySkuAndEmpresa_IdAndIdNot("SKU-DE-OUTRO", EMPRESA_ID, PRODUTO_ID))
                .thenReturn(true);

        assertThatThrownBy(() -> atualizar(requestComUN().sku("SKU-DE-OUTRO").build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .satisfies(noCampo("sku"));

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void atualizarMantendoOProprioSkuNaoDeveFalhar() {
        produtoExistente(existente().sku("SKU-PROPRIO"));
        when(produtoRepository.existsBySkuAndEmpresa_IdAndIdNot("SKU-PROPRIO", EMPRESA_ID, PRODUTO_ID))
                .thenReturn(false);
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().nome("Produto Atualizado").precoVenda("15")
                .sku("SKU-PROPRIO").build());

        assertThat(atualizado.getSku()).isEqualTo("SKU-PROPRIO");
        verify(produtoRepository).existsBySkuAndEmpresa_IdAndIdNot("SKU-PROPRIO", EMPRESA_ID, PRODUTO_ID);
        verify(produtoRepository).save(any(Produto.class));
    }

    @Test
    void inativarEReativarProdutoDevemAlterarStatus() {
        produtoExistente();
        salvamentoDevolveOProduto();

        Produto inativado = produtoService.inativar(EMPRESA_ID, produtoUuid);
        assertThat(inativado.isAtivo()).isFalse();

        Produto reativado = produtoService.reativar(EMPRESA_ID, produtoUuid);
        assertThat(reativado.isAtivo()).isTrue();
    }

    @Test
    void buscarPorIdDeOutraEmpresaDeveLancarProdutoNaoEncontrado() {
        UUID deOutraEmpresa = UUID.randomUUID();
        when(produtoRepository.findByUuidAndEmpresa_Id(deOutraEmpresa, 2L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> produtoService.buscarPorId(2L, deOutraEmpresa))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
    }

    // ---------- Codigos de barras (spec 4.3) ----------

    @Test
    void codigoNovoComDigitoInvalidoLanca400ComMensagemFixa() {
        assertThatThrownBy(() -> cadastrar(requestComUN().codigosBarras(EAN13_DIGITO_INVALIDO).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Código de barras 7891000315508 com dígito verificador inválido. Confira a leitura.")
                .satisfies(noCampo("codigosBarras"));

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void codigoNovoComDigitoInvalidoNaEdicaoTambemLanca400() {
        produtoExistente(existente().codigo(EAN13_VALIDO));

        assertThatThrownBy(() -> atualizar(requestComUN().codigosBarras(EAN13_VALIDO, "96385075").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Código de barras 96385075 com dígito verificador inválido. Confira a leitura.");

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void codigoJaGravadoComoOutroEMantidoAoEditar() {
        // Review Focus 1: EAN-13 de digito invalido vindo da migracao (gravado OUTRO).
        Produto produto = produtoExistente(existente().codigo(EAN13_DIGITO_INVALIDO, FormatoCodigoBarras.OUTRO));
        ProdutoCodigoBarras gravado = produto.getCodigosBarras().get(0);
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().nome("Feijão 1kg").codigosBarras(EAN13_DIGITO_INVALIDO)
                .build());

        assertThat(atualizado.getNome()).isEqualTo("Feijão 1kg");
        assertThat(atualizado.getCodigosBarras()).singleElement().isSameAs(gravado);
        assertThat(formatosDe(atualizado)).containsExactly(FormatoCodigoBarras.OUTRO);
        verify(produtoRepository, never()).produtoComCodigo(any(), any(), any());
    }

    @Test
    void codigoFormatoDesconhecidoAceitoComoOutro() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().codigosBarras("ABC-123", "123456789").build());

        assertThat(codigosDe(produto)).containsExactly("ABC-123", "123456789");
        assertThat(formatosDe(produto)).containsOnly(FormatoCodigoBarras.OUTRO);
    }

    @Test
    void codigoEmOutroProdutoDaEmpresaLanca409ComNome() {
        when(produtoRepository.produtoComCodigo(EMPRESA_ID, EAN13_VALIDO, null)).thenReturn(Optional.of("Arroz 5kg"));

        assertThatThrownBy(() -> cadastrar(requestComUN().codigosBarras(EAN13_VALIDO).build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("O código de barras 7891000315507 já está cadastrado no produto \"Arroz 5kg\".")
                .satisfies(noCampo("codigosBarras"));

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void unicidadeDoCodigoNaEdicaoIgnoraOProprioProdutoESoConsultaAEmpresa() {
        // Review Focus 3: a consulta e sempre restrita a empresa do usuario.
        produtoExistente();
        when(produtoRepository.produtoComCodigo(EMPRESA_ID, EAN8_VALIDO, PRODUTO_ID))
                .thenReturn(Optional.of("Bala"));

        assertThatThrownBy(() -> atualizar(requestComUN().codigosBarras(EAN8_VALIDO).build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("O código de barras 96385074 já está cadastrado no produto \"Bala\".");

        verify(produtoRepository).produtoComCodigo(EMPRESA_ID, EAN8_VALIDO, PRODUTO_ID);
        verify(produtoRepository, never()).save(any());
    }

    @Test
    void codigoRepetidoNoEnvioLanca400() {
        // Repetido depois da normalizacao (espacos removidos).
        assertThatThrownBy(() -> cadastrar(requestComUN().codigosBarras(EAN13_VALIDO, " 7891 000315507 ").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Código de barras repetido na lista.")
                .satisfies(noCampo("codigosBarras"));

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void maisDe20CodigosLanca400() {
        List<String> vinteEUm = IntStream.rangeClosed(1, 21).mapToObj(numero -> "COD-" + numero).toList();

        assertThatThrownBy(() -> cadastrar(requestComUN().codigosBarras(vinteEUm).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Informe no máximo 20 códigos de barras.")
                .satisfies(noCampo("codigosBarras"));

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void exatamente20CodigosSaoAceitos() {
        cadastroPermitido();
        List<String> vinte = IntStream.rangeClosed(1, 20).mapToObj(numero -> "COD-" + numero).toList();

        Produto produto = cadastrar(requestComUN().codigosBarras(vinte).build());

        assertThat(produto.getCodigosBarras()).hasSize(20);
    }

    @Test
    void codigosVaziosSaoDescartadosEOsDemaisNormalizados() {
        cadastroPermitido();

        List<String> informados = new ArrayList<>(List.of("  ", " 7891 000315507\n", ""));
        informados.add(null);
        Produto produto = cadastrar(requestComUN().codigosBarras(informados).build());

        assertThat(codigosDe(produto)).containsExactly(EAN13_VALIDO);
    }

    @Test
    void codigoAcimaDe50CaracteresLanca400() {
        assertThatThrownBy(() -> cadastrar(requestComUN().codigosBarras("X".repeat(51)).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Código de barras deve ter no máximo 50 caracteres.")
                .satisfies(noCampo("codigosBarras"));
    }

    @Test
    void patchSubstituiListaDeCodigosNaOrdem() {
        Produto produto = produtoExistente(existente().codigo(EAN13_VALIDO).codigo("ABC-1"));
        ProdutoCodigoBarras abc = produto.getCodigosBarras().get(1);
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().codigosBarras(EAN8_VALIDO, "ABC-1").build());

        assertThat(codigosDe(atualizado)).containsExactly(EAN8_VALIDO, "ABC-1");
        assertThat(formatosDe(atualizado)).containsExactly(FormatoCodigoBarras.EAN8, FormatoCodigoBarras.OUTRO);
        assertThat(atualizado.getCodigosBarras()).extracting(ProdutoCodigoBarras::getOrdem).containsExactly(0, 1);
        // Codigo mantido e a mesma linha (so a ordem muda); o removido sai da lista.
        assertThat(atualizado.getCodigosBarras().get(1)).isSameAs(abc);
    }

    @Test
    void patchInvertendoAOrdemReaproveitaAsLinhasEPreservaFormatos() {
        Produto produto = produtoExistente(existente().codigo(EAN13_VALIDO).codigo(EAN13_DIGITO_INVALIDO,
                FormatoCodigoBarras.OUTRO));
        List<ProdutoCodigoBarras> originais = List.copyOf(produto.getCodigosBarras());
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().codigosBarras(EAN13_DIGITO_INVALIDO, EAN13_VALIDO).build());

        assertThat(atualizado.getCodigosBarras()).containsExactly(originais.get(1), originais.get(0));
        assertThat(formatosDe(atualizado)).containsExactly(FormatoCodigoBarras.OUTRO, FormatoCodigoBarras.EAN13);
        assertThat(atualizado.getCodigosBarras()).extracting(ProdutoCodigoBarras::getOrdem).containsExactly(0, 1);
    }

    @Test
    void patchComCodigosNuloMantemOsCodigosSemValidarNemSubstituir() {
        // Decisao do CTO: campo ausente/null no PATCH mantem a lista atual.
        Produto produto = produtoExistente(existente().codigo(EAN13_VALIDO).codigo("ABC-1"));
        List<ProdutoCodigoBarras> originais = List.copyOf(produto.getCodigosBarras());
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().nome("Arroz 1kg").codigosBarras((List<String>) null).build());

        assertThat(atualizado.getNome()).isEqualTo("Arroz 1kg");
        assertThat(atualizado.getCodigosBarras()).containsExactlyElementsOf(originais);
        assertThat(atualizado.getAtualizadoEm()).isNull();
        verify(produtoRepository, never()).produtoComCodigo(any(), any(), any());
    }

    @Test
    void cadastroComCodigosNuloFicaSemCodigos() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().codigosBarras((List<String>) null).build());

        assertThat(produto.getCodigosBarras()).isEmpty();
    }

    @Test
    void patchQueMudaSoOsCodigosCarimbaAtualizadoEm() {
        // Codigos ficam em outra tabela: sem o carimbo, o produto nao ficaria sujo.
        produtoExistente(existente().codigo(EAN13_VALIDO).codigo("ABC-1"));
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().nome("Produto Existente")
                .codigosBarras("ABC-1", EAN13_VALIDO).build());

        assertThat(atualizado.getAtualizadoEm()).isNotNull();
    }

    @Test
    void patchComOsMesmosCodigosNaMesmaOrdemNaoCarimbaPelosCodigos() {
        produtoExistente(existente().codigo(EAN13_VALIDO).codigo("ABC-1"));
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().nome("Produto Existente")
                .codigosBarras(" 7891 000315507 ", "ABC-1").build());

        assertThat(atualizado.getAtualizadoEm()).isNull();
    }

    @Test
    void produtoNovoNaoCarimbaAtualizadoEmAoReceberCodigos() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().codigosBarras(EAN13_VALIDO).build());

        assertThat(produto.getAtualizadoEm()).isNull();
    }

    @Test
    void patchSemCodigosRemoveTodos() {
        produtoExistente(existente().codigo(EAN13_VALIDO));
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().codigosBarras(Collections.emptyList()).build());

        assertThat(atualizado.getCodigosBarras()).isEmpty();
    }

    // ---------- Nome curto e fornecedor (spec 4.1 e 4.4) ----------

    @Test
    void nomeCurtoEfetivoUsaNomeCurtoOuTrunca() {
        Produto comNomeCurto = ProdutoTesteBuilder.produto(empresa, un)
                .nome("Ração Golden Adulto Frango e Arroz 15kg").nomeCurto("Golden Frango 15kg").build();
        Produto nomeLongo = ProdutoTesteBuilder.produto(empresa, un)
                .nome("Ração Golden Adulto Frango e Arroz 15kg").build();
        Produto nomeCurtoDeFato = ProdutoTesteBuilder.produto(empresa, un).nome("Arroz 5kg").build();
        Produto cortaNoEspaco = ProdutoTesteBuilder.produto(empresa, un)
                .nome("Biscoito recheado chocolate 1 kg").build();

        assertThat(comNomeCurto.nomeCurtoEfetivo()).isEqualTo("Golden Frango 15kg");
        assertThat(nomeLongo.nomeCurtoEfetivo()).isEqualTo("Ração Golden Adulto Frango e A").hasSize(30);
        assertThat(nomeCurtoDeFato.nomeCurtoEfetivo()).isEqualTo("Arroz 5kg");
        // Os 30 primeiros terminam em espaco: o efetivo sai aparado.
        assertThat(cortaNoEspaco.nomeCurtoEfetivo()).isEqualTo("Biscoito recheado chocolate 1");
    }

    @Test
    void nomeCurtoEFornecedorSaoAparadosEVazioViraNulo() {
        cadastroPermitido();

        Produto informado = cadastrar(requestComUN().nomeCurto("  Golden 15kg ").fornecedor("  Distribuidora X ")
                .build());
        Produto emBranco = cadastrar(requestComUN().nomeCurto("   ").fornecedor("").build());

        assertThat(informado.getNomeCurto()).isEqualTo("Golden 15kg");
        assertThat(informado.getFornecedor()).isEqualTo("Distribuidora X");
        assertThat(emBranco.getNomeCurto()).isNull();
        assertThat(emBranco.getFornecedor()).isNull();
    }

    // ---------- SKU sugerido (spec 4.2) ----------

    @Test
    void sugerirSkuUsaMaiorDoPadraoMaisUm() {
        when(produtoRepository.skusNoPadrao(EMPRESA_ID)).thenReturn(List.of("P000001", "P000007", "ABC", "p000009"));

        assertThat(produtoService.sugerirSku(EMPRESA_ID)).isEqualTo("P000008");
    }

    @Test
    void sugerirSkuSemPadraoComecaEmP000001() {
        when(produtoRepository.skusNoPadrao(EMPRESA_ID)).thenReturn(List.of());

        assertThat(produtoService.sugerirSku(EMPRESA_ID)).isEqualTo("P000001");
    }

    @Test
    void sugerirSkuUsaDigitosAsciiComQualquerLocalePadrao() {
        // Locale com digitos tailandeses: sem Locale.ROOT, o %06d sairia "P๐๐๐๐๐๑".
        when(produtoRepository.skusNoPadrao(EMPRESA_ID)).thenReturn(List.of());
        Locale anterior = Locale.getDefault(Locale.Category.FORMAT);
        try {
            Locale.setDefault(Locale.Category.FORMAT, Locale.forLanguageTag("th-TH-u-nu-thai"));

            assertThat(produtoService.sugerirSku(EMPRESA_ID)).isEqualTo("P000001");
        } finally {
            Locale.setDefault(Locale.Category.FORMAT, anterior);
        }
    }

    @Test
    void sugerirSkuAcimaDe999999() {
        when(produtoRepository.skusNoPadrao(EMPRESA_ID)).thenReturn(List.of("P999999", "P12345", "PX000001"));

        assertThat(produtoService.sugerirSku(EMPRESA_ID)).isEqualTo("P1000000");
    }

    @Test
    void sugerirSkuComNumeroMaiorQueLongNaoEstoura() {
        when(produtoRepository.skusNoPadrao(EMPRESA_ID)).thenReturn(List.of("P99999999999999999999"));

        assertThat(produtoService.sugerirSku(EMPRESA_ID)).isEqualTo("P100000000000000000000");
    }

    // ---------- Sugestoes de marca e fornecedor (spec 4.4) ----------

    @Test
    void sugestoesCampoInvalidoLanca400() {
        assertThatThrownBy(() -> produtoService.sugestoes(EMPRESA_ID, "x", "gol"))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Campo de sugestão inválido.");
        assertThatThrownBy(() -> produtoService.sugestoes(EMPRESA_ID, null, "gol"))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Campo de sugestão inválido.");
        assertThatThrownBy(() -> produtoService.sugestoes(EMPRESA_ID, "nome", "gol"))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Campo de sugestão inválido.");
    }

    @Test
    void sugestoesDeMarcaUsamPadraoEscapadoEmMinusculasELimite10() {
        when(produtoRepository.sugestoesDeMarca(EMPRESA_ID, "%gol\\_den\\%%", 10)).thenReturn(List.of("Gol_den%"));

        assertThat(produtoService.sugestoes(EMPRESA_ID, "marca", "  GOL_den% ")).containsExactly("Gol_den%");
        verify(produtoRepository, never()).sugestoesDeFornecedor(any(), any(), anyInt());
    }

    @Test
    void sugestoesDeFornecedorSemTermoTrazemOsMaisUsados() {
        when(produtoRepository.sugestoesDeFornecedor(EMPRESA_ID, "%%", 10)).thenReturn(List.of("Distribuidora X"));

        assertThat(produtoService.sugestoes(EMPRESA_ID, "fornecedor", null)).containsExactly("Distribuidora X");
        assertThat(produtoService.sugestoes(EMPRESA_ID, "fornecedor", "   ")).containsExactly("Distribuidora X");
    }

    @Test
    void sugestoesComTermoAcimaDe50CaracteresUsamOs50Primeiros() {
        String termo = "a".repeat(60);
        when(produtoRepository.sugestoesDeMarca(EMPRESA_ID, "%" + "a".repeat(50) + "%", 10)).thenReturn(List.of());

        assertThat(produtoService.sugestoes(EMPRESA_ID, "marca", termo)).isEmpty();
    }

    // ---------- Exclusao (spec 4.5) ----------

    @Test
    void excluirRemoveQuandoPodeExcluir() {
        Produto produto = produtoExistente();

        produtoService.excluir(ID_USUARIO, EMPRESA_ID, produtoUuid);

        InOrder ordem = inOrder(produtoRepository);
        ordem.verify(produtoRepository).delete(produto);
        ordem.verify(produtoRepository).flush();
    }

    @Test
    void excluirRegistraLogSoComIdentificadores() {
        // Lacuna do QA: o rastro provisorio da exclusao traz usuario, empresa e
        // UUID publico, mas nunca dado do cadastro (nome, SKU).
        produtoExistente(existente().nome("Ração Secreta 15kg").sku("SKU-SIGILOSO"));
        Logger logDoService = (Logger) LoggerFactory.getLogger(ProdutoService.class);
        ListAppender<ILoggingEvent> capturados = new ListAppender<>();
        capturados.start();
        logDoService.addAppender(capturados);
        try {
            produtoService.excluir(ID_USUARIO, EMPRESA_ID, produtoUuid);
        } finally {
            logDoService.detachAppender(capturados);
        }

        String saida = String.join("\n", capturados.list.stream().map(ILoggingEvent::getFormattedMessage).toList());
        assertThat(saida)
                .contains("usuario=" + ID_USUARIO, "empresa=" + EMPRESA_ID, "produto=" + produtoUuid)
                .doesNotContain("Ração Secreta 15kg", "SKU-SIGILOSO");
    }

    @Test
    void excluirBloqueadoLanca409ComMensagemFixa() {
        produtoExistente();
        resumoDoProduto(new ResumoDeEstoque(new BigDecimal("5"), 2, 1));

        assertThatThrownBy(() -> produtoService.excluir(ID_USUARIO, EMPRESA_ID, produtoUuid))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage(MENSAGEM_EXCLUSAO_COM_MOVIMENTO);

        verify(produtoRepository, never()).delete(any());
        verify(registroDeEstoqueInicial, never()).removerParaExclusao(anyLong(), anyLong());
    }

    @Test
    void excluirDeOutraEmpresaLanca404() {
        UUID deOutraEmpresa = UUID.randomUUID();
        when(produtoRepository.buscarPorUuidParaAtualizar(deOutraEmpresa, EMPRESA_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> produtoService.excluir(ID_USUARIO, EMPRESA_ID, deOutraEmpresa))
                .isInstanceOf(ProdutoNaoEncontradoException.class);

        verify(produtoRepository, never()).delete(any());
    }

    // ---------- Colunas normalizadas da busca (Fase E, spec 4.1) ----------

    @Test
    void cadastrarPreencheColunasNormalizadas() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().nome("  Ração Golden  ").nomeCurto("GLD AÇÚCAR").sku("P000001")
                .marca("Premier").build());

        assertThat(produto.getNomeNormalizado()).isEqualTo("racao golden");
        assertThat(produto.getBuscaNormalizada()).isEqualTo("racao golden gld acucar p000001 premier");
    }

    @Test
    void editarNomeMarcaSkuOuNomeCurtoRecalcula() {
        produtoExistente(existente().nome("Arroz").sku("SKU-1").marca("Camil"));
        edicaoPermitida();

        Produto produto = atualizar(requestComUN().nome("Feijão Preto").nomeCurto("FEIJÃO").sku("SKU-2")
                .marca("União").build());

        assertThat(produto.getNomeNormalizado()).isEqualTo("feijao preto");
        assertThat(produto.getBuscaNormalizada()).isEqualTo("feijao preto feijao sku-2 uniao");
    }

    // ---------- Listagem (docs/modules/produtos-listagem.md, 4 e 5) ----------

    private static final LocalDate HOJE_DO_RELOGIO = LocalDate.of(2020, 3, 8);

    private static ParametrosDaListagem parametros(String busca) {
        return ParametrosDaListagem.daRequisicao(busca, null, null, null, null, null, 0, 25);
    }

    /** A consulta devolve estes ids (na ordem) e o total; o repositorio carrega os produtos em outra ordem. */
    private void consultaDevolve(long total, Produto... produtosNaOrdem) {
        List<Long> ids = Arrays.stream(produtosNaOrdem).map(Produto::getId).toList();
        when(consultaDeProdutos.buscar(any(), any(), anyInt(), anyInt())).thenReturn(new PaginaDeIds(ids, total));
        if (ids.isEmpty()) {
            return;
        }
        List<Produto> foraDeOrdem = new ArrayList<>(List.of(produtosNaOrdem));
        Collections.reverse(foraDeOrdem);
        when(produtoRepository.buscarComRelacoesPorIds(EMPRESA_ID, ids)).thenReturn(foraDeOrdem);
    }

    private FiltroDeProdutos filtroConsultado() {
        ArgumentCaptor<FiltroDeProdutos> filtro = ArgumentCaptor.forClass(FiltroDeProdutos.class);
        verify(consultaDeProdutos, atLeast(1)).buscar(filtro.capture(), any(), anyInt(), anyInt());
        return filtro.getValue();
    }

    /** Review Focus 1: NBSP colado de planilha, U+2007, U+202F ou so espacos nunca viram busca (nem 500). */
    @Test
    void buscaSoComEspacosUnicodeEhSemBusca() {
        usuarioAtivoDaEmpresa(9L);
        arvoreDaEmpresa();
        consultaDevolve(0);

        for (String busca : Arrays.asList(null, "", "   ", "\u00a0", "\u2007", " \u202f ", "\t\u3000")) {
            produtoService.listarParaUsuario(9L, parametros(busca));

            FiltroDeProdutos filtro = filtroConsultado();
            assertThat(filtro.palavras()).as("palavras de [%s]", busca).isEmpty();
            assertThat(filtro.termoDeCodigo()).as("codigo de [%s]", busca).isNull();
        }
    }

    @Test
    void buscaViraPalavrasNormalizadasETermoDeCodigoSemEspacos() {
        usuarioAtivoDaEmpresa(9L);
        arvoreDaEmpresa();
        consultaDevolve(0);

        produtoService.listarParaUsuario(9L, parametros(" 50%_  AÇÚCAR\u00a0União "));

        FiltroDeProdutos filtro = filtroConsultado();
        assertThat(filtro.palavras()).containsExactly("50%_", "acucar", "uniao");
        assertThat(filtro.termoDeCodigo()).isEqualTo("50%_AÇÚCARUnião");
        assertThat(filtro.termoNumerico()).isNull();
    }

    /** Fase B2: termo so com digitos tambem vira o numero (sem zeros) para o Nº e o codigo do produto. */
    @Test
    void buscaNumericaViraTermoNumericoSemZeros() {
        usuarioAtivoDaEmpresa(9L);
        arvoreDaEmpresa();
        consultaDevolve(0);

        produtoService.listarParaUsuario(9L, parametros(" 000542 "));

        FiltroDeProdutos filtro = filtroConsultado();
        assertThat(filtro.palavras()).containsExactly("000542");
        assertThat(filtro.termoDeCodigo()).isEqualTo("000542");
        assertThat(filtro.termoNumerico()).isEqualTo(542L);
    }

    @Test
    void filtrosEOrdemSaoRepassadosAConsultaComAEmpresaEOHojeDoRelogio() {
        usuarioAtivoDaEmpresa(9L);
        arvoreDaEmpresa();
        consultaDevolve(0);

        produtoService.listarParaUsuario(9L,
                ParametrosDaListagem.daRequisicao(null, "inativos", null, "sem", "true", "-margem", 4, 10));

        ArgumentCaptor<FiltroDeProdutos> filtro = ArgumentCaptor.forClass(FiltroDeProdutos.class);
        verify(consultaDeProdutos).buscar(filtro.capture(), eq(OrdemDeProdutos.MARGEM_DESC), eq(4), eq(10));
        assertThat(filtro.getValue()).isEqualTo(new FiltroDeProdutos(EMPRESA_ID, List.of(), null, null,
                StatusFiltro.INATIVOS, null, EstoqueFiltro.SEM, true, HOJE_DO_RELOGIO));
    }

    @Test
    void categoriaFiltraComAsDescendentesDaArvore() {
        usuarioAtivoDaEmpresa(9L);
        Categoria racao = categoria(100L, empresa, null, "Ração");
        Categoria umida = categoria(101L, empresa, racao, "Úmida");
        Categoria bebidas = categoria(102L, empresa, null, "Bebidas");
        arvoreDaEmpresa(racao, umida, bebidas);
        consultaDevolve(0);

        produtoService.listarParaUsuario(9L,
                ParametrosDaListagem.daRequisicao(null, null, racao.getUuid(), null, null, null, 0, 25));

        assertThat(filtroConsultado().categoriaIds()).containsExactlyInAnyOrder(100L, 101L);
        verify(categoriaService, times(1)).arvoreDaEmpresa(EMPRESA_ID);
    }

    /** Review Focus 5: categoria de outra empresa ou excluida (UUID que nao esta na arvore) = lista vazia. */
    @Test
    void categoriaForaDaArvoreDaEmpresaViraConjuntoVazio() {
        usuarioAtivoDaEmpresa(9L);
        arvoreDaEmpresa(categoria(100L, empresa, null, "Ração"));
        consultaDevolve(0);

        produtoService.listarParaUsuario(9L,
                ParametrosDaListagem.daRequisicao(null, null, UUID.randomUUID(), null, null, null, 0, 25));

        assertThat(filtroConsultado().categoriaIds()).isEmpty();
    }

    @Test
    void semCategoriaNaoFiltraPorCategoria() {
        usuarioAtivoDaEmpresa(9L);
        arvoreDaEmpresa();
        consultaDevolve(0);

        produtoService.listarParaUsuario(9L, parametros(null));

        assertThat(filtroConsultado().categoriaIds()).isNull();
    }

    @Test
    void respostaPreservaAOrdemDosIds() {
        usuarioAtivoDaEmpresa(9L);
        arvoreDaEmpresa();
        Produto caro = ProdutoTesteBuilder.produto(empresa, un).id(7L).nome("Caro").build();
        Produto medio = ProdutoTesteBuilder.produto(empresa, un).id(5L).nome("Medio").build();
        Produto barato = ProdutoTesteBuilder.produto(empresa, un).id(6L).nome("Barato").build();
        consultaDevolve(3, caro, medio, barato);

        PaginaResponse<ProdutoResponse> pagina = produtoService.listarParaUsuario(9L, parametros(null));

        assertThat(pagina.itens()).extracting(ProdutoResponse::nome).containsExactly("Caro", "Medio", "Barato");
        assertThat(pagina.totalItens()).isEqualTo(3);
        assertThat(pagina.pagina()).isZero();
        assertThat(pagina.tamanho()).isEqualTo(25);
    }

    /** Produto excluido entre a contagem e a carga (corrida): fica fora da pagina, sem erro. */
    @Test
    void idQueSumiuEntreAsEtapasFicaForaDaPagina() {
        usuarioAtivoDaEmpresa(9L);
        arvoreDaEmpresa();
        Produto arroz = ProdutoTesteBuilder.produto(empresa, un).id(5L).nome("Arroz").build();
        when(consultaDeProdutos.buscar(any(), any(), anyInt(), anyInt()))
                .thenReturn(new PaginaDeIds(List.of(8L, 5L), 2));
        when(produtoRepository.buscarComRelacoesPorIds(EMPRESA_ID, List.of(8L, 5L))).thenReturn(List.of(arroz));

        PaginaResponse<ProdutoResponse> pagina = produtoService.listarParaUsuario(9L, parametros(null));

        assertThat(pagina.itens()).extracting(ProdutoResponse::nome).containsExactly("Arroz");
    }

    /** Review Focus 2: pagina alem do fim traz o total real e nao carrega produtos nem estoque. */
    @Test
    void paginaAlemDoFimDevolveOTotalSemCarregarProdutos() {
        usuarioAtivoDaEmpresa(9L);
        arvoreDaEmpresa();
        consultaDevolve(40);

        PaginaResponse<ProdutoResponse> pagina = produtoService.listarParaUsuario(9L,
                ParametrosDaListagem.daRequisicao(null, null, null, null, null, null, 9, 25));

        assertThat(pagina.itens()).isEmpty();
        assertThat(pagina.totalItens()).isEqualTo(40);
        assertThat(pagina.pagina()).isEqualTo(9);
        verify(produtoRepository, never()).buscarComRelacoesPorIds(any(), any());
        verifyNoInteractions(usoNoEstoque);
    }

    @Test
    void listarParaUsuarioMontaAArvoreUmaUnicaVezComOCaminhoDaCategoria() {
        usuarioAtivoDaEmpresa(9L);
        Categoria racao = categoria(100L, empresa, null, "Ração");
        Categoria umida = categoria(101L, empresa, racao, "Úmida");
        Produto comCategoria = ProdutoTesteBuilder.produto(empresa, un).id(5L).nome("Sachê").categoria(umida)
                .precoVenda("3.00").codigo(EAN13_VALIDO).build();
        Produto semCategoria = ProdutoTesteBuilder.produto(empresa, un).id(6L).nome("Avulso").precoVenda("1.00")
                .build();
        consultaDevolve(2, comCategoria, semCategoria);
        arvoreDaEmpresa(racao, umida);

        List<ProdutoResponse> produtos = produtoService.listarParaUsuario(9L, parametros(null)).itens();

        assertThat(produtos).hasSize(2);
        assertThat(produtos.get(0).categoria().caminho()).isEqualTo("Ração › Úmida");
        assertThat(produtos.get(0).unidade().sigla()).isEqualTo("UN");
        assertThat(produtos.get(0).codigosBarras())
                .containsExactly(new CodigoBarrasResponse(EAN13_VALIDO, FormatoCodigoBarras.EAN13));
        assertThat(produtos.get(0).podeExcluir()).isTrue();
        assertThat(produtos.get(1).categoria()).isNull();
        verify(categoriaService, times(1)).arvoreDaEmpresa(EMPRESA_ID);
    }

    @Test
    void listarParaUsuarioCalculaASituacaoDaPromocaoPeloRelogio() {
        // RELOGIO: 08/03/2020 em Sao Paulo.
        usuarioAtivoDaEmpresa(9L);
        Produto vigente = ProdutoTesteBuilder.produto(empresa, un).id(5L).nome("Vigente")
                .promocao("8.90", INICIO_PROMOCAO, FIM_PROMOCAO).build();
        Produto agendada = ProdutoTesteBuilder.produto(empresa, un).id(6L).nome("Agendada")
                .promocao("8.90", LocalDate.of(2020, 3, 9), FIM_PROMOCAO).build();
        Produto semPromocao = ProdutoTesteBuilder.produto(empresa, un).id(7L).nome("Sem promoção").build();
        consultaDevolve(3, vigente, agendada, semPromocao);
        arvoreDaEmpresa();

        List<ProdutoResponse> produtos = produtoService.listarParaUsuario(9L, parametros(null)).itens();

        assertThat(produtos).extracting(ProdutoResponse::emPromocao).containsExactly(true, false, false);
        assertThat(produtos.get(0).promocao().situacao()).isEqualTo(SituacaoPromocao.VIGENTE);
        assertThat(produtos.get(1).promocao().situacao()).isEqualTo(SituacaoPromocao.AGENDADA);
        assertThat(produtos.get(2).promocao()).isNull();
    }

    // ---------- Normalizacao de campos opcionais (vazio/branco -> null; trim) ----------

    @Test
    void cadastrarComCamposOpcionaisEmBrancoDeveNormalizarParaNull() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().codigosBarras("   ").sku("").marca("  ").descricao("   ").build());

        assertThat(produto.getSku()).isNull();
        assertThat(produto.getCodigosBarras()).isEmpty();
        assertThat(produto.getMarca()).isNull();
        assertThat(produto.getDescricao()).isNull();
        // Sem SKU/codigo apos normalizacao, a checagem de unicidade nem e consultada.
        verify(produtoRepository, never()).existsBySkuAndEmpresa_Id(any(), anyLong());
        verify(produtoRepository, never()).produtoComCodigo(any(), any(), any());
    }

    @Test
    void cadastrarDeveAplicarTrimNosCamposInformados() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().nome("  Produto  ").codigosBarras("  789123  ")
                .sku("  SKU-1  ").marca("  Tio João  ").descricao("  Arroz tipo 1  ").build());

        assertThat(produto.getNome()).isEqualTo("Produto");
        assertThat(produto.getSku()).isEqualTo("SKU-1");
        assertThat(codigosDe(produto)).containsExactly("789123");
        assertThat(produto.getMarca()).isEqualTo("Tio João");
        assertThat(produto.getDescricao()).isEqualTo("Arroz tipo 1");
    }

    @Test
    void atualizarComCamposOpcionaisEmBrancoDeveNormalizarParaNull() {
        produtoExistente(existente().sku("SKU-ANTIGO").codigo("111222333"));
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().codigosBarras("   ").sku("").marca("  ").descricao("   ")
                .build());

        assertThat(atualizado.getSku()).isNull();
        assertThat(atualizado.getCodigosBarras()).isEmpty();
        assertThat(atualizado.getMarca()).isNull();
        assertThat(atualizado.getDescricao()).isNull();
    }

    // ---------- Campos cadastrais V4: nao-negativos + regras cruzadas ----------

    @Test
    void cadastrarComEstoqueMaximoNegativoDeveFalhar() {
        assertThatThrownBy(() -> cadastrar(requestComUN().estoqueMaximo("-1").build()))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComPontoReposicaoNegativoDeveFalhar() {
        assertThatThrownBy(() -> cadastrar(requestComUN().pontoReposicao("-0.5").build()))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComPrecoMinimoNegativoDeveFalhar() {
        assertThatThrownBy(() -> cadastrar(requestComUN().precoMinimo("-1").build()))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComPrecoMinimoMaiorQuePrecoVendaDeveFalhar() {
        assertThatThrownBy(() -> cadastrar(requestComUN().precoVenda("10.00").precoMinimo("15.00").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Preço mínimo não pode ser maior que o preço de venda.");

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComEstoqueMaximoMenorQueEstoqueMinimoDeveFalhar() {
        assertThatThrownBy(() -> cadastrar(requestComUN().estoqueMinimo("5").estoqueMaximo("2").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Estoque máximo não pode ser menor que o estoque mínimo.");

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComEstoqueMaximoIgualAoEstoqueMinimoDevePermitir() {
        // Limite da regra cruzada: a validacao usa "<" (menor que), nao "<=".
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().estoqueMinimo("10").estoqueMaximo("10").build());

        assertThat(produto.getEstoqueMinimo()).isEqualByComparingTo("10");
        assertThat(produto.getEstoqueMaximo()).isEqualByComparingTo("10");
        verify(produtoRepository).save(any(Produto.class));
    }

    @Test
    void cadastrarComEstoqueMaximoSemEstoqueMinimoNaoDeveAplicarRegraCruzada() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().estoqueMaximo("2").build());

        assertThat(produto.getEstoqueMaximo()).isEqualByComparingTo("2");
        assertThat(produto.getEstoqueMinimo()).isNull();
    }

    @Test
    void cadastrarComCamposCadastraisValidosDevePreservarOsValores() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().nome("Arroz 5kg").precoVenda("25.90").custo("18.00")
                .estoqueMinimo("2").marca("Tio João").descricao("Arroz branco tipo 1").estoqueMaximo("50")
                .pontoReposicao("10").precoMinimo("20.00").build());

        assertThat(produto.getMarca()).isEqualTo("Tio João");
        assertThat(produto.getDescricao()).isEqualTo("Arroz branco tipo 1");
        assertThat(produto.getEstoqueMaximo()).isEqualByComparingTo("50");
        assertThat(produto.getPontoReposicao()).isEqualByComparingTo("10");
        assertThat(produto.getPrecoMinimo()).isEqualByComparingTo("20.00");
    }

    @Test
    void cadastrarComPrecoMinimoIgualAoPrecoVendaDevePermitir() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().precoVenda("10.00").precoMinimo("10.00").build());

        assertThat(produto.getPrecoMinimo()).isEqualByComparingTo("10.00");
    }

    @Test
    void atualizarComPrecoMinimoMaiorQuePrecoVendaDeveFalhar() {
        produtoExistente();

        assertThatThrownBy(() -> atualizar(requestComUN().precoVenda("10.00").precoMinimo("12.00").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Preço mínimo não pode ser maior que o preço de venda.");

        verify(produtoRepository, never()).save(any());
    }

    // ---------- Unidade, categoria e conversao de compra (spec 5.1) ----------

    @Test
    void unidadeDeOutraEmpresaLanca404() {
        UUID unidadeDeOutraEmpresa = UUID.randomUUID();
        when(unidadeService.buscarDaEmpresa(EMPRESA_ID, unidadeDeOutraEmpresa))
                .thenThrow(new CatalogoNaoEncontradoException("Unidade de medida não encontrada."));

        assertThatThrownBy(() -> cadastrar(comUnidade(unidadeDeOutraEmpresa).build()))
                .isInstanceOf(CatalogoNaoEncontradoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void categoriaDeOutraEmpresaLanca404() {
        unidadeDaEmpresa(un);
        UUID categoriaDeOutraEmpresa = UUID.randomUUID();
        when(categoriaService.buscarDaEmpresa(EMPRESA_ID, categoriaDeOutraEmpresa))
                .thenThrow(new CatalogoNaoEncontradoException("Categoria não encontrada."));

        assertThatThrownBy(() -> cadastrar(requestComUN().categoriaId(categoriaDeOutraEmpresa).build()))
                .isInstanceOf(CatalogoNaoEncontradoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void unidadeInativaSoSeJaForAAtual() {
        // Review Focus 4 (Fase A). Cadastrar com unidade inativa -> 400.
        UnidadeMedida inativa = unidade(13L, empresa, "PCT");
        inativa.inativar();
        unidadeDaEmpresa(inativa);
        assertThatThrownBy(() -> cadastrar(comUnidade(inativa.getUuid()).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Esta unidade está inativa. Escolha uma unidade ativa.");

        // Editar mantendo a mesma unidade, inativada depois -> salva.
        produtoExistente(ProdutoTesteBuilder.produto(empresa, inativa).id(PRODUTO_ID));
        salvamentoDevolveOProduto();
        Produto atualizado = atualizar(comUnidade(inativa.getUuid()).nome("Novo nome").build());
        assertThat(atualizado.getUnidade()).isSameAs(inativa);
        assertThat(atualizado.getNome()).isEqualTo("Novo nome");

        // Trocar para outra unidade inativa -> 400.
        UnidadeMedida outraInativa = unidade(14L, empresa, "FD");
        outraInativa.inativar();
        unidadeDaEmpresa(outraInativa);
        assertThatThrownBy(() -> atualizar(comUnidade(outraInativa.getUuid()).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Esta unidade está inativa. Escolha uma unidade ativa.");
    }

    @Test
    void categoriaNaoSelecionavelSoSeJaForAAtual() {
        // Review Focus 4 (Fase A): categoria inativa (ou sob ancestral inativo).
        Categoria racao = categoria(100L, empresa, null, "Ração");
        Categoria umida = categoria(101L, empresa, racao, "Úmida");
        racao.inativar();
        unidadeDaEmpresa(un);
        categoriaDaEmpresa(umida);
        arvoreDaEmpresa(racao, umida);

        // Cadastrar sob ramo inativo -> 400.
        assertThatThrownBy(() -> cadastrar(requestComUN().categoriaId(umida.getUuid()).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Esta categoria está inativa. Escolha uma categoria ativa.");

        // Editar mantendo a mesma categoria -> salva (sem consultar a arvore de novo).
        produtoExistente(existente().categoria(umida));
        salvamentoDevolveOProduto();
        Produto atualizado = atualizar(requestComUN().categoriaId(umida.getUuid()).nome("Novo nome").build());
        assertThat(atualizado.getCategoria()).isSameAs(umida);
        verify(categoriaService, times(1)).arvoreDaEmpresa(EMPRESA_ID);

        // Trocar para outra categoria inativa -> 400.
        categoriaDaEmpresa(racao);
        assertThatThrownBy(() -> atualizar(requestComUN().categoriaId(racao.getUuid()).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Esta categoria está inativa. Escolha uma categoria ativa.");
    }

    @Test
    void categoriaSelecionavelEGravada() {
        Categoria bebidas = categoria(102L, empresa, null, "Bebidas");
        categoriaDaEmpresa(bebidas);
        arvoreDaEmpresa(bebidas);
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().categoriaId(bebidas.getUuid()).build());

        assertThat(produto.getCategoria()).isSameAs(bebidas);
    }

    // ---------- Promocao e atacado (spec 4.3 e 4.4) ----------

    private ProdutoRequestBuilder comPromocao(String preco) {
        return requestComUN().promocao(preco, INICIO_PROMOCAO, FIM_PROMOCAO);
    }

    private static ThrowingConsumer<Throwable> regraNoCampo(String campo, String mensagem) {
        return erro -> {
            assertThat(erro).isInstanceOf(RegraDeNegocioException.class).hasMessage(mensagem);
            assertThat(((RegraDeNegocioException) erro).campo()).contains(campo);
        };
    }

    private static UnidadeMedida unidadeFracionada(Long id, Empresa empresa, String sigla) {
        UnidadeMedida unidade = new UnidadeMedida(empresa, sigla, "Unidade " + sigla, true);
        ReflectionTestUtils.setField(unidade, "id", id);
        return unidade;
    }

    @Test
    void promocaoEAtacadoValidosSaoGravados() {
        cadastroPermitido();

        Produto produto = cadastrar(comPromocao("8.90").atacado("8.50", "12").build());

        assertThat(produto.getPrecoPromocional()).isEqualByComparingTo("8.90");
        assertThat(produto.getPromocaoInicio()).isEqualTo(INICIO_PROMOCAO);
        assertThat(produto.getPromocaoFim()).isEqualTo(FIM_PROMOCAO);
        assertThat(produto.getPrecoAtacado()).isEqualByComparingTo("8.50");
        assertThat(produto.getQuantidadeMinimaAtacado()).isEqualByComparingTo("12");
    }

    @Test
    void promocaoIncompletaLanca400NoCampoQueFalta() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(requestComUN().promocao(null, INICIO_PROMOCAO, FIM_PROMOCAO).build()))
                .satisfies(regraNoCampo("promocao.preco", "Informe o preço promocional."));
        assertThatThrownBy(() -> cadastrar(requestComUN().promocao("8.90", null, FIM_PROMOCAO).build()))
                .satisfies(regraNoCampo("promocao.inicio", "Informe o início da promoção."));
        assertThatThrownBy(() -> cadastrar(requestComUN().promocao("8.90", INICIO_PROMOCAO, null).build()))
                .satisfies(regraNoCampo("promocao.fim", "Informe o fim da promoção."));
        verify(produtoRepository, never()).save(any());
    }

    @Test
    void promocaoFimAntesDoInicio() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(requestComUN().promocao("8.90", FIM_PROMOCAO, INICIO_PROMOCAO).build()))
                .satisfies(regraNoCampo("promocao.fim", "O fim da promoção não pode ser antes do início."));
        verify(produtoRepository, never()).save(any());
    }

    @Test
    void promocaoPrecoZero() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(comPromocao("0.00").build()))
                .satisfies(regraNoCampo("promocao.preco", "Preço promocional deve ser maior que zero."));
        assertThatThrownBy(() -> cadastrar(comPromocao("-1").build()))
                .satisfies(regraNoCampo("promocao.preco", "Preço promocional deve ser maior que zero."));
    }

    @Test
    void promocaoIgualAoPrecoDeVenda() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(comPromocao("10.0").precoVenda("10.00").build()))
                .satisfies(regraNoCampo("promocao.preco", "Preço promocional deve ser menor que o preço de venda."));
    }

    @Test
    void promocaoAbaixoDoPrecoMinimo() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(comPromocao("7.99").precoMinimo("8.00").build()))
                .satisfies(regraNoCampo("promocao.preco",
                        "Preço promocional não pode ser menor que o preço mínimo."));
    }

    @Test
    void promocaoIgualAoPrecoMinimoEPermitida() {
        cadastroPermitido();

        Produto produto = cadastrar(comPromocao("8.00").precoMinimo("8.00").build());

        assertThat(produto.getPrecoPromocional()).isEqualByComparingTo("8.00");
    }

    @Test
    void precoVendaReduzidoAbaixoDaPromocaoGravada() {
        // Review Focus 2: o formulario reenvia a promocao gravada (8,90) com o preco de venda novo.
        produtoExistente(existente().promocao("8.90", INICIO_PROMOCAO, FIM_PROMOCAO));
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> atualizar(comPromocao("8.90").precoVenda("8.90").build()))
                .satisfies(regraNoCampo("promocao.preco", "Preço promocional deve ser menor que o preço de venda."));
        assertThatThrownBy(() -> atualizar(comPromocao("8.90").precoVenda("8.00").build()))
                .satisfies(regraNoCampo("promocao.preco", "Preço promocional deve ser menor que o preço de venda."));
        verify(produtoRepository, never()).save(any());
    }

    @Test
    void atacadoPrecoZero() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(requestComUN().atacado("0", "12").build()))
                .satisfies(regraNoCampo("atacado.preco", "Preço de atacado deve ser maior que zero."));
    }

    @Test
    void atacadoIncompletoLanca400NoCampoQueFalta() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(requestComUN().atacado(null, "12").build()))
                .satisfies(regraNoCampo("atacado.preco", "Informe o preço de atacado."));
        assertThatThrownBy(() -> cadastrar(requestComUN().atacado("8.50", null).build()))
                .satisfies(regraNoCampo("atacado.quantidadeMinima", "Informe a quantidade mínima do atacado."));
    }

    @Test
    void atacadoIgualAoPrecoDeVenda() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(requestComUN().precoVenda("10.00").atacado("10", "12").build()))
                .satisfies(regraNoCampo("atacado.preco", "Preço de atacado deve ser menor que o preço de venda."));
    }

    @Test
    void atacadoAbaixoDoMinimo() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(requestComUN().precoMinimo("8.00").atacado("7.99", "12").build()))
                .satisfies(regraNoCampo("atacado.preco", "Preço de atacado não pode ser menor que o preço mínimo."));
    }

    @Test
    void promocaoDeUmDiaEPermitida() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().promocao("8.90", INICIO_PROMOCAO, INICIO_PROMOCAO).build());

        assertThat(produto.getPromocaoInicio()).isEqualTo(produto.getPromocaoFim()).isEqualTo(INICIO_PROMOCAO);
    }

    @Test
    void cadastroComPromocaoJaEncerradaEPermitido() {
        // Nao se valida "fim >= hoje" (spec 4.3): datas antes do RELOGIO sao aceitas no cadastro.
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().promocao("8.90", LocalDate.of(2020, 2, 1),
                LocalDate.of(2020, 2, 15)).build());

        assertThat(produto.getPromocaoFim()).isEqualTo(LocalDate.of(2020, 2, 15));
    }

    @Test
    void atacadoMaiorQueOPrecoDeVenda() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(requestComUN().precoVenda("10.00").atacado("11.00", "12").build()))
                .satisfies(regraNoCampo("atacado.preco", "Preço de atacado deve ser menor que o preço de venda."));
    }

    @Test
    void promocaoEAtacadoInvalidosReportaAPromocaoPrimeiro() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(comPromocao("0").atacado("0", "1").build()))
                .satisfies(regraNoCampo("promocao.preco", "Preço promocional deve ser maior que zero."));
    }

    @Test
    void quantidadeMinimaUm() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(requestComUN().atacado("8.50", "1.000").build()))
                .satisfies(regraNoCampo("atacado.quantidadeMinima",
                        "A quantidade mínima do atacado deve ser maior que 1."));
        assertThatThrownBy(() -> cadastrar(requestComUN().atacado("8.50", "0.5").build()))
                .satisfies(regraNoCampo("atacado.quantidadeMinima",
                        "A quantidade mínima do atacado deve ser maior que 1."));
    }

    @Test
    void quantidadeMinimaComMaisDeTresCasasLanca400MesmoSemBeanValidation() {
        UnidadeMedida kg = unidadeFracionada(11L, empresa, "KG");
        unidadeDaEmpresa(kg);

        assertThatThrownBy(() -> cadastrar(comUnidade(kg.getUuid()).atacado("8.50", "2.5001").build()))
                .satisfies(regraNoCampo("atacado.quantidadeMinima",
                        "A quantidade mínima do atacado deve ter no máximo 3 casas decimais."));
    }

    @Test
    void quantidadeFracionadaEmUnidadeNaoFracionada() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(requestComUN().atacado("8.50", "2.5").build()))
                .satisfies(regraNoCampo("atacado.quantidadeMinima", "A unidade UN não aceita quantidade fracionada."));
    }

    @Test
    void quantidadeInteiraComZerosDecimaisEmUnidadeNaoFracionadaEPermitida() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().atacado("8.50", "12.000").build());

        assertThat(produto.getQuantidadeMinimaAtacado()).isEqualByComparingTo("12");
    }

    @Test
    void mesmaQuantidadeEmUnidadeFracionada_ok() {
        UnidadeMedida kg = unidadeFracionada(11L, empresa, "KG");
        unidadeDaEmpresa(kg);
        when(empresaRepository.findById(EMPRESA_ID)).thenReturn(Optional.of(empresa));
        salvamentoDevolveOProduto();

        Produto produto = cadastrar(comUnidade(kg.getUuid()).atacado("8.50", "2.5").build());

        assertThat(produto.getQuantidadeMinimaAtacado()).isEqualByComparingTo("2.5");
    }

    @Test
    void unidadeTrocadaParaNaoFracionadaComAtacadoFracionado() {
        // Review Focus 3: o atacado de 2,5 foi gravado em KG; trocar a unidade para UN invalida a quantidade.
        UnidadeMedida kg = unidadeFracionada(11L, empresa, "KG");
        produtoExistente(ProdutoTesteBuilder.produto(empresa, kg).id(PRODUTO_ID).atacado("8.50", "2.5"));
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> atualizar(requestComUN().atacado("8.50", "2.5").build()))
                .satisfies(regraNoCampo("atacado.quantidadeMinima", "A unidade UN não aceita quantidade fracionada."));
        verify(produtoRepository, never()).save(any());
    }

    @Test
    void promocaoEncerradaPodeSerSalva() {
        produtoExistente(existente().promocao("8.90", LocalDate.of(2020, 2, 1), LocalDate.of(2020, 2, 15)));
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().nome("Outro nome")
                .promocao("8.90", LocalDate.of(2020, 2, 1), LocalDate.of(2020, 2, 15)).build());

        assertThat(atualizado.getNome()).isEqualTo("Outro nome");
        assertThat(atualizado.getPromocaoFim()).isEqualTo(LocalDate.of(2020, 2, 15));
    }

    @Test
    void patchComPromocaoEAtacadoNulosRemove() {
        produtoExistente(existente().promocao("8.90", INICIO_PROMOCAO, FIM_PROMOCAO).atacado("8.50", "12"));
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().build());

        assertThat(atualizado.getPrecoPromocional()).isNull();
        assertThat(atualizado.getPromocaoInicio()).isNull();
        assertThat(atualizado.getPromocaoFim()).isNull();
        assertThat(atualizado.getPrecoAtacado()).isNull();
        assertThat(atualizado.getQuantidadeMinimaAtacado()).isNull();
    }

    @Test
    void respostaUsaADataDoRelogioParaASituacaoDaPromocao() {
        usuarioAtivoDaEmpresa(9L);
        produtoExistente(existente().promocao("8.90", INICIO_PROMOCAO, FIM_PROMOCAO));

        ProdutoResponse resposta = produtoService.buscarPorIdParaUsuario(9L, produtoUuid);

        assertThat(resposta.promocao().situacao()).isEqualTo(SituacaoPromocao.VIGENTE);
        assertThat(resposta.emPromocao()).isTrue();
    }


    // ---------- Historico de precos (spec 4.6) ----------

    /** Linhas de historico gravadas, na ordem em que o service as salvou. */
    private List<HistoricoPreco> historicoGravado() {
        ArgumentCaptor<HistoricoPreco> linhas = ArgumentCaptor.forClass(HistoricoPreco.class);
        verify(historicoPrecoRepository, atLeast(0)).save(linhas.capture());
        return linhas.getAllValues();
    }

    private static Tuple linha(CampoHistoricoPreco campo, String anterior, String novo) {
        return tuple(campo, anterior == null ? null : new BigDecimal(anterior), novo == null ? null : new BigDecimal(novo));
    }

    private static ListAssert<Tuple> assertLinhas(List<HistoricoPreco> linhas) {
        return assertThat(linhas.stream()
                .map(linha -> tuple(linha.getCampo(), linha.getValorAnterior(), linha.getValorNovo()))
                .toList());
    }

    @Test
    void cadastroComCusto_registraPrecoECusto() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().precoVenda("25.90").custo("18.00").build());

        List<HistoricoPreco> linhas = historicoGravado();
        assertLinhas(linhas).containsExactly(
                linha(CampoHistoricoPreco.PRECO_VENDA, null, "25.90"),
                linha(CampoHistoricoPreco.CUSTO, null, "18.00"));
        assertThat(linhas).allSatisfy(linha -> {
            assertThat(linha.getProduto()).isSameAs(produto);
            assertThat(linha.getEmpresaId()).isEqualTo(EMPRESA_ID);
            assertThat(linha.getUsuarioId()).isEqualTo(ID_USUARIO);
        });
    }

    @Test
    void cadastroSemCusto_registraSoPreco() {
        cadastroPermitido();

        cadastrar(requestComUN().precoVenda("10.00").build());

        assertLinhas(historicoGravado()).containsExactly(linha(CampoHistoricoPreco.PRECO_VENDA, null, "10.00"));
    }

    @Test
    void historicoSoEGravadoDepoisDoProduto() {
        cadastroPermitido();

        cadastrar(requestComUN().build());

        InOrder ordem = inOrder(produtoRepository, historicoPrecoRepository);
        ordem.verify(produtoRepository).save(any(Produto.class));
        ordem.verify(historicoPrecoRepository).save(any(HistoricoPreco.class));
    }

    @Test
    void edicaoMudaSoPreco_umaLinha() {
        produtoExistente(existente().precoVenda("10.00").custo("7.00"));
        edicaoPermitida();

        atualizar(requestComUN().precoVenda("11.50").custo("7.00").build());

        assertLinhas(historicoGravado()).containsExactly(linha(CampoHistoricoPreco.PRECO_VENDA, "10.00", "11.50"));
    }

    @Test
    void edicaoMudaSoCusto_umaLinha() {
        produtoExistente(existente().precoVenda("10.00").custo("7.00"));
        edicaoPermitida();

        atualizar(requestComUN().precoVenda("10.00").custo("7.50").build());

        assertLinhas(historicoGravado()).containsExactly(linha(CampoHistoricoPreco.CUSTO, "7.00", "7.50"));
    }

    @Test
    void custoRemovido_valorNovoNulo() {
        produtoExistente(existente().precoVenda("10.00").custo("7.00"));
        edicaoPermitida();

        atualizar(requestComUN().precoVenda("10.00").custoRemovido().build());

        assertLinhas(historicoGravado()).containsExactly(linha(CampoHistoricoPreco.CUSTO, "7.00", null));
    }

    @Test
    void custoInformadoPelaPrimeiraVez_valorAnteriorNulo() {
        produtoExistente(existente().precoVenda("10.00"));
        edicaoPermitida();

        atualizar(requestComUN().precoVenda("10.00").custo("6.00").build());

        assertLinhas(historicoGravado()).containsExactly(linha(CampoHistoricoPreco.CUSTO, null, "6.00"));
    }

    @Test
    void edicaoSemMudancaDePrecoOuCusto_nenhumaLinha() {
        produtoExistente(existente().precoVenda("10.00").custo("7.00"));
        edicaoPermitida();

        atualizar(requestComUN().nome("Outro nome").precoVenda("10.00").custo("7.00")
                .promocao("8.90", INICIO_PROMOCAO, FIM_PROMOCAO).atacado("8.50", "12").build());

        verify(historicoPrecoRepository, never()).save(any());
    }

    @Test
    void dezVsDezZeroZero_nenhumaLinha() {
        produtoExistente(existente().precoVenda("10.00").custo("7.00"));
        edicaoPermitida();

        atualizar(requestComUN().precoVenda("10.0").custo("7").build());

        verify(historicoPrecoRepository, never()).save(any());
    }

    @Test
    void inativarEReativarNaoGeramHistorico() {
        produtoExistente();
        salvamentoDevolveOProduto();

        produtoService.inativar(EMPRESA_ID, produtoUuid);
        produtoService.reativar(EMPRESA_ID, produtoUuid);

        verify(historicoPrecoRepository, never()).save(any());
    }

    @Test
    void usuarioDaLinhaEhOAutenticado() {
        usuarioAtivoDaEmpresa(42L);
        cadastroPermitido();

        produtoService.cadastrarParaUsuario(42L, requestComUN().build());

        assertThat(historicoGravado()).extracting(HistoricoPreco::getUsuarioId).containsExactly(42L);
    }

    @Test
    void falhaDeValidacaoNaoGravaHistorico() {
        produtoExistente(existente().precoVenda("10.00"));
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> atualizar(requestComUN().precoVenda("12.00").atacado("13.00", "12").build()))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(historicoPrecoRepository, never()).save(any());
    }

    @Test
    void produtoAntigoEditadoComPromocaoEAtacadoNulos_soOQueMudou() {
        // Review Focus 5: produto da Fase B (sem promocao nem atacado) editado pelo formulario novo.
        produtoExistente(existente().precoVenda("10.00").custo("7.00"));
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().precoVenda("10.00").custo("7.20").build());

        assertThat(atualizado.getPrecoPromocional()).isNull();
        assertThat(atualizado.getPrecoAtacado()).isNull();
        assertLinhas(historicoGravado()).containsExactly(linha(CampoHistoricoPreco.CUSTO, "7.00", "7.20"));
    }

    // ---------- Consulta do historico ----------

    @Test
    void historicoConsultaAPaginaDoProdutoDaEmpresa() {
        usuarioAtivoDaEmpresa(9L);
        produtoExistente();
        HistoricoPrecoResponse item = new HistoricoPrecoResponse(CampoHistoricoPreco.PRECO_VENDA,
                new BigDecimal("10.00"), new BigDecimal("11.50"), null, "Ana Souza",
                LocalDateTime.of(2026, 10, 21, 14, 3, 12));
        when(historicoPrecoRepository.historicoDoProduto(EMPRESA_ID, PRODUTO_ID,
                PageRequest.of(1, 2)))
                .thenReturn(new PageImpl<>(List.of(item), PageRequest.of(1, 2), 3));

        PaginaResponse<HistoricoPrecoResponse> pagina = produtoService.historicoDePrecosParaUsuario(9L, produtoUuid,
                1, 2);

        assertThat(pagina).isEqualTo(new PaginaResponse<>(List.of(item), 1, 2, 3));
    }

    @Test
    void historicoComPaginacaoForaDosLimites_400() {
        assertThatThrownBy(() -> produtoService.historicoDePrecosParaUsuario(9L, UUID.randomUUID(), -1, 20))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A página deve ser maior ou igual a zero.");
        assertThatThrownBy(() -> produtoService.historicoDePrecosParaUsuario(9L, UUID.randomUUID(), 0, 101))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("O tamanho da página deve ser entre 1 e 100.");
        assertThatThrownBy(() -> produtoService.historicoDePrecosParaUsuario(9L, UUID.randomUUID(), 0, 0))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("O tamanho da página deve ser entre 1 e 100.");

        verifyNoInteractions(historicoPrecoRepository);
    }

    @Test
    void historicoComPaginaGrandeDemais_400() {
        // pagina * tamanho estoura o int do deslocamento (offset) da consulta: 400, nao 500.
        assertThatThrownBy(() -> produtoService.historicoDePrecosParaUsuario(9L, UUID.randomUUID(), 21474837, 100))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A página informada é grande demais.");

        verifyNoInteractions(historicoPrecoRepository);
    }

    @Test
    void historicoNoLimiteDoDeslocamentoEAceito() {
        usuarioAtivoDaEmpresa(9L);
        produtoExistente();
        PageRequest ultimaPagina = PageRequest.of(Integer.MAX_VALUE, 1);
        when(historicoPrecoRepository.historicoDoProduto(EMPRESA_ID, PRODUTO_ID, ultimaPagina))
                .thenReturn(new PageImpl<>(List.of(), ultimaPagina, 0));

        assertThat(produtoService.historicoDePrecosParaUsuario(9L, produtoUuid, Integer.MAX_VALUE, 1).itens())
                .isEmpty();
    }

    @Test
    void historicoDeProdutoDeOutraEmpresa_404() {
        usuarioAtivoDaEmpresa(9L);
        UUID deOutraEmpresa = UUID.randomUUID();
        when(produtoRepository.findByUuidAndEmpresa_Id(deOutraEmpresa, EMPRESA_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> produtoService.historicoDePrecosParaUsuario(9L, deOutraEmpresa, 0, 20))
                .isInstanceOf(ProdutoNaoEncontradoException.class);

        verifyNoInteractions(historicoPrecoRepository);
    }

    // ---------- Resolucao da empresa a partir do usuario autenticado ----------

    @Test
    void cadastrarParaUsuarioInativoDeveFalharComCredenciaisInvalidas() {
        Usuario usuarioInativo = mock(Usuario.class);
        when(usuarioInativo.isAtivo()).thenReturn(false);
        when(usuarioRepository.findById(9L)).thenReturn(Optional.of(usuarioInativo));

        assertThatThrownBy(() -> produtoService.cadastrarParaUsuario(9L, requestComUN().build()))
                .isInstanceOf(CredenciaisInvalidasException.class);

        verify(produtoRepository, never()).save(any());
    }

    // ---------- Fase D: estoque (docs/modules/produtos-estoque.md) ----------

    private static final String MENSAGEM_EXCLUSAO_COM_MOVIMENTO =
            "Este produto já teve movimentação de estoque e não pode ser excluído. Inative-o.";

    /** Resumo de estoque devolvido para o produto {@link #PRODUTO_ID}. */
    private void resumoDoProduto(ResumoDeEstoque resumo) {
        when(usoNoEstoque.resumos(EMPRESA_ID, List.of(PRODUTO_ID))).thenReturn(Map.of(PRODUTO_ID, resumo));
    }

    private static ResumoDeEstoque soEstoqueInicial(String saldo) {
        return new ResumoDeEstoque(new BigDecimal(saldo), 1, 0);
    }

    private static ResumoDeEstoque comAjuste(String saldo) {
        return new ResumoDeEstoque(new BigDecimal(saldo), 2, 1);
    }

    @Test
    void cadastroComEstoqueInicialRegistraEntrada() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().estoqueInicial("12").build());

        InOrder ordem = inOrder(produtoRepository, registroDeEstoqueInicial);
        ordem.verify(produtoRepository).save(produto);
        ordem.verify(registroDeEstoqueInicial).registrar(produto, new BigDecimal("12"), ID_USUARIO);
        assertThat(produto.isControlaEstoque()).isTrue();
    }

    @Test
    void cadastroSemEstoqueInicialNaoRegistraMovimento() {
        cadastroPermitido();

        cadastrar(requestComUN().build());

        verifyNoInteractions(registroDeEstoqueInicial);
    }

    @Test
    void cadastroComControleDesligadoGravaAFlag() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().controlaEstoque(false).build());

        assertThat(produto.isControlaEstoque()).isFalse();
    }

    @Test
    void cadastroComEstoqueInicialSemControle_400() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(requestComUN().controlaEstoque(false).estoqueInicial("5").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Ligue o controle de estoque para informar o estoque inicial.")
                .satisfies(noCampo("estoqueInicial"));

        verify(produtoRepository, never()).save(any());
        verifyNoInteractions(registroDeEstoqueInicial);
    }

    @Test
    void estoqueInicialFracionadoEmUN_400() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(requestComUN().estoqueInicial("2.5").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A unidade UN não aceita quantidade fracionada.")
                .satisfies(noCampo("estoqueInicial"));

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void estoqueInicialZero_400() {
        unidadeDaEmpresa(un);

        assertThatThrownBy(() -> cadastrar(requestComUN().estoqueInicial("0").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Informe uma quantidade maior que zero.")
                .satisfies(noCampo("estoqueInicial"));
    }

    @Test
    void estoqueInicialComMaisDeTresCasas_400() {
        UnidadeMedida kg = new UnidadeMedida(empresa, "KG", "Quilograma", true);
        unidadeDaEmpresa(kg);

        assertThatThrownBy(() -> cadastrar(comUnidade(kg.getUuid()).estoqueInicial("1.0005").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A quantidade deve ter no máximo 9 dígitos inteiros e 3 casas decimais.")
                .satisfies(noCampo("estoqueInicial"));
    }

    @Test
    void estoqueInicialFracionadoEmKG_ok() {
        UnidadeMedida kg = new UnidadeMedida(empresa, "KG", "Quilograma", true);
        unidadeDaEmpresa(kg);
        when(empresaRepository.findById(EMPRESA_ID)).thenReturn(Optional.of(empresa));
        salvamentoDevolveOProduto();

        Produto produto = cadastrar(comUnidade(kg.getUuid()).estoqueInicial("2.5").build());

        verify(registroDeEstoqueInicial).registrar(produto, new BigDecimal("2.5"), ID_USUARIO);
    }

    @Test
    void estoqueInicialNoPatch_400() {
        produtoExistente();

        assertThatThrownBy(() -> atualizar(requestComUN().estoqueInicial("3").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("O estoque inicial só pode ser informado no cadastro. Use Ajustar estoque.")
                .satisfies(noCampo("estoqueInicial"));

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void trocarUnidadeComMovimento_400() {
        produtoExistente();
        UnidadeMedida kg = unidade(11L, empresa, "KG");
        unidadeDaEmpresa(kg);
        resumoDoProduto(soEstoqueInicial("10"));

        assertThatThrownBy(() -> atualizar(comUnidade(kg.getUuid()).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Não é possível trocar a unidade de um produto com movimentação de estoque.")
                .satisfies(noCampo("unidadeId"));

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void trocarUnidadeSemMovimento_ok() {
        produtoExistente();
        UnidadeMedida kg = unidade(11L, empresa, "KG");
        unidadeDaEmpresa(kg);
        salvamentoDevolveOProduto();

        Produto atualizado = atualizar(comUnidade(kg.getUuid()).build());

        assertThat(atualizado.getUnidade()).isSameAs(kg);
    }

    @Test
    void manterAUnidadeNaoConsultaOEstoque() {
        produtoExistente();
        edicaoPermitida();

        atualizar(requestComUN().nome("Outro nome").build());

        verifyNoInteractions(usoNoEstoque);
    }

    @Test
    void desligarOControleEPermitido() {
        produtoExistente();
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().controlaEstoque(false).build());

        assertThat(atualizado.isControlaEstoque()).isFalse();
    }

    @Test
    void pontoMenorQueMinimo_400() {
        assertThatThrownBy(() -> cadastrar(requestComUN().estoqueMinimo("5").pontoReposicao("3").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("O ponto de reposição não pode ser menor que o estoque mínimo.")
                .satisfies(noCampo("pontoReposicao"));
    }

    @Test
    void maximoMenorQuePonto_400() {
        assertThatThrownBy(() -> cadastrar(requestComUN().pontoReposicao("10").estoqueMaximo("8").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("O estoque máximo não pode ser menor que o ponto de reposição.")
                .satisfies(noCampo("estoqueMaximo"));
    }

    @Test
    void niveisIguaisSaoAceitos() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().estoqueMinimo("5").pontoReposicao("5").estoqueMaximo("5")
                .build());

        assertThat(produto.getPontoReposicao()).isEqualByComparingTo("5");
    }

    @Test
    void podeExcluirSemMovimento() {
        usuarioAtivoDaEmpresa(9L);
        produtoExistente();

        assertThat(produtoService.buscarPorIdParaUsuario(9L, produtoUuid).podeExcluir()).isTrue();
    }

    @Test
    void podeExcluirSoComEstoqueInicial() {
        usuarioAtivoDaEmpresa(9L);
        produtoExistente();
        resumoDoProduto(soEstoqueInicial("5"));

        assertThat(produtoService.buscarPorIdParaUsuario(9L, produtoUuid).podeExcluir()).isTrue();
    }

    @Test
    void naoPodeExcluirComAjuste() {
        usuarioAtivoDaEmpresa(9L);
        produtoExistente();
        resumoDoProduto(comAjuste("5"));

        assertThat(produtoService.buscarPorIdParaUsuario(9L, produtoUuid).podeExcluir()).isFalse();
    }

    /** Review Focus 4: desligado, o saldo guardado continua na resposta e a situacao vem nula. */
    @Test
    void respostaComControleDesligadoMantemSaldoESituacaoNula() {
        usuarioAtivoDaEmpresa(9L);
        produtoExistente(existente().semControleDeEstoque().pontoReposicao("20"));
        resumoDoProduto(comAjuste("12"));

        ProdutoResponse resposta = produtoService.buscarPorIdParaUsuario(9L, produtoUuid);

        assertThat(resposta.controlaEstoque()).isFalse();
        assertThat(resposta.estoqueAtual()).isEqualByComparingTo("12");
        assertThat(resposta.situacaoEstoque()).isNull();
    }

    @Test
    void respostaComControleLigadoCalculaASituacao() {
        usuarioAtivoDaEmpresa(9L);
        produtoExistente(existente().pontoReposicao("15"));
        resumoDoProduto(comAjuste("12"));

        ProdutoResponse resposta = produtoService.buscarPorIdParaUsuario(9L, produtoUuid);

        assertThat(resposta.controlaEstoque()).isTrue();
        assertThat(resposta.estoqueAtual()).isEqualByComparingTo("12");
        assertThat(resposta.situacaoEstoque()).isEqualTo(SituacaoEstoque.BAIXO);
    }

    @Test
    void produtoSemMovimentoTemSaldoZeroESemEstoque() {
        usuarioAtivoDaEmpresa(9L);
        produtoExistente();

        ProdutoResponse resposta = produtoService.buscarPorIdParaUsuario(9L, produtoUuid);

        assertThat(resposta.estoqueAtual()).isEqualByComparingTo("0");
        assertThat(resposta.situacaoEstoque()).isEqualTo(SituacaoEstoque.SEM_ESTOQUE);
    }

    @Test
    void listagemCarregaOEstoqueDeTodosOsProdutosNumaChamada() {
        usuarioAtivoDaEmpresa(9L);
        Produto arroz = ProdutoTesteBuilder.produto(empresa, un).id(5L).nome("Arroz").build();
        Produto feijao = ProdutoTesteBuilder.produto(empresa, un).id(6L).nome("Feijão").build();
        arvoreDaEmpresa();
        consultaDevolve(2, arroz, feijao);
        when(usoNoEstoque.resumos(EMPRESA_ID, List.of(5L, 6L)))
                .thenReturn(Map.of(5L, comAjuste("3"), 6L, soEstoqueInicial("4")));

        List<ProdutoResponse> produtos = produtoService.listarParaUsuario(9L, parametros(null)).itens();

        assertThat(produtos).extracting(ProdutoResponse::estoqueAtual)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("3"), new BigDecimal("4"));
        assertThat(produtos).extracting(ProdutoResponse::podeExcluir).containsExactly(false, true);
        verify(usoNoEstoque, times(1)).resumos(any(), any());
    }

    @Test
    void excluirSemMovimentoNaoMexeNoEstoque() {
        Produto produto = produtoExistente();

        produtoService.excluir(ID_USUARIO, EMPRESA_ID, produtoUuid);

        verify(produtoRepository).buscarPorUuidParaAtualizar(produtoUuid, EMPRESA_ID);
        verify(produtoRepository).delete(produto);
        verify(registroDeEstoqueInicial, never()).removerParaExclusao(anyLong(), anyLong());
    }

    @Test
    void excluirSoComEstoqueInicialRemoveOMovimentoAntesDoProdutoERegistraNoLog() {
        Produto produto = produtoExistente();
        resumoDoProduto(soEstoqueInicial("5.000"));
        Logger logDoService = (Logger) LoggerFactory.getLogger(ProdutoService.class);
        ListAppender<ILoggingEvent> capturados = new ListAppender<>();
        capturados.start();
        logDoService.addAppender(capturados);
        try {
            produtoService.excluir(ID_USUARIO, EMPRESA_ID, produtoUuid);
        } finally {
            logDoService.detachAppender(capturados);
        }

        InOrder ordem = inOrder(registroDeEstoqueInicial, produtoRepository);
        ordem.verify(registroDeEstoqueInicial).removerParaExclusao(EMPRESA_ID, PRODUTO_ID);
        ordem.verify(produtoRepository).delete(produto);
        ordem.verify(produtoRepository).flush();
        assertThat(capturados.list).extracting(ILoggingEvent::getFormattedMessage)
                .anySatisfy(mensagem -> assertThat(mensagem).contains("produto=" + produtoUuid, "estoqueInicial=5"));
    }

    /** Review Focus 2: violacao de FK no DELETE (movimento gravado por outro caminho) vira 409, nunca 500. */
    @Test
    void violacaoDeFkAoExcluirVira409() {
        produtoExistente();
        doThrow(new DataIntegrityViolationException("fk_movimento_estoque_produto")).when(produtoRepository).flush();

        assertThatThrownBy(() -> produtoService.excluir(ID_USUARIO, EMPRESA_ID, produtoUuid))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage(MENSAGEM_EXCLUSAO_COM_MOVIMENTO);
    }

    // ---------- Fase B2: numero, codigo do produto e balanca ----------

    private static final String MENSAGEM_CODIGO_INTERVALO = "O código do produto deve ter de 1 a 6 dígitos.";
    private static final String MENSAGEM_BALANCA_SEM_CODIGO = "Informe o código do produto para vendê-lo na balança.";

    @Test
    void cadastroGeraNumeroSequencial() {
        cadastroPermitido();
        when(numerador.proximo(EMPRESA_ID, TipoNumeracao.PRODUTO)).thenReturn(15L);

        Produto produto = cadastrar(requestComUN().build());

        assertThat(produto.getNumero()).isEqualTo(15L);
        InOrder ordem = inOrder(numerador, produtoRepository);
        ordem.verify(numerador).proximo(EMPRESA_ID, TipoNumeracao.PRODUTO);
        ordem.verify(produtoRepository).save(produto);
    }

    /** Review Focus 1: a regra recusa antes de reservar o numero, entao nenhum numero e consumido. */
    @Test
    void cadastroRecusadoAntesDeReservarNaoConsomeNumero() {
        when(produtoRepository.existsBySkuAndEmpresa_Id("SKU-1", EMPRESA_ID)).thenReturn(true);

        assertThatThrownBy(() -> cadastrar(requestComUN().sku("SKU-1").build()))
                .isInstanceOf(ProdutoConflitoException.class);
        assertThatThrownBy(() -> cadastrar(requestComUN().vendidoBalanca(true).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage(MENSAGEM_BALANCA_SEM_CODIGO);

        verifyNoInteractions(numerador);
    }

    @Test
    void edicaoNaoMudaONumero() {
        produtoExistente(existente().numero(7));
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().nome("Outro nome").codigoDoProduto(542).build());

        assertThat(atualizado.getNumero()).isEqualTo(7L);
        verifyNoInteractions(numerador);
    }

    @Test
    void cadastroGravaCodigoEBalanca() {
        cadastroPermitido();
        when(tamanhoDoCodigoNaEtiqueta.digitosCodigo(EMPRESA_ID)).thenReturn(6);

        Produto produto = cadastrar(requestComUN().codigoDoProduto(542).vendidoBalanca(true).build());

        assertThat(produto.getCodigo()).isEqualTo(542);
        assertThat(produto.isVendidoBalanca()).isTrue();
        verify(produtoRepository).nomeDoProdutoComCodigo(EMPRESA_ID, 542, null);
    }

    @Test
    void codigoRepetido_409ComCampoENome() {
        when(produtoRepository.nomeDoProdutoComCodigo(EMPRESA_ID, 542, null))
                .thenReturn(Optional.of("Açúcar a granel"));

        assertThatThrownBy(() -> cadastrar(requestComUN().codigoDoProduto(542).build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Este código já está em uso no produto Açúcar a granel.")
                .satisfies(noCampo("codigo"));

        verify(produtoRepository, never()).save(any());
        verifyNoInteractions(numerador);
    }

    /** Na edicao, o proprio produto fica fora da checagem: manter o codigo nao conflita. */
    @Test
    void edicaoMantendoOProprioCodigoIgnoraOProduto() {
        produtoExistente(existente().codigoDoProduto(542));
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().codigoDoProduto(542).build());

        assertThat(atualizado.getCodigo()).isEqualTo(542);
        verify(produtoRepository).nomeDoProdutoComCodigo(EMPRESA_ID, 542, PRODUTO_ID);
    }

    @Test
    void edicaoComCodigoDeOutroProduto_409() {
        produtoExistente();
        when(produtoRepository.nomeDoProdutoComCodigo(EMPRESA_ID, 542, PRODUTO_ID))
                .thenReturn(Optional.of("Feijão a granel"));

        assertThatThrownBy(() -> atualizar(requestComUN().codigoDoProduto(542).build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Este código já está em uso no produto Feijão a granel.")
                .satisfies(noCampo("codigo"));
    }

    /** Defesa alem do Bean Validation (chamadas sem {@code @Valid}). */
    @Test
    void codigoForaDoIntervalo_400() {
        for (int foraDoIntervalo : List.of(0, -1, 1_000_000)) {
            assertThatThrownBy(() -> cadastrar(requestComUN().codigoDoProduto(foraDoIntervalo).build()))
                    .isInstanceOf(RegraDeNegocioException.class)
                    .hasMessage(MENSAGEM_CODIGO_INTERVALO)
                    .satisfies(noCampo("codigo"));
        }

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void balancaSemCodigo_400() {
        assertThatThrownBy(() -> cadastrar(requestComUN().vendidoBalanca(true).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage(MENSAGEM_BALANCA_SEM_CODIGO)
                .satisfies(noCampo("codigo"));

        verify(produtoRepository, never()).save(any());
    }

    /** Review Focus 3: etiqueta com 4 digitos de codigo nao comporta o codigo 12345 (mesmo sem mudar o codigo). */
    @Test
    void codigoGrandeDemaisParaEtiqueta_400() {
        produtoExistente(existente().codigoDoProduto(12345).vendidoBalanca());
        when(tamanhoDoCodigoNaEtiqueta.digitosCodigo(EMPRESA_ID)).thenReturn(4);

        assertThatThrownBy(() -> atualizar(requestComUN().codigoDoProduto(12345).vendidoBalanca(true).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Este código tem mais dígitos do que a etiqueta da balança comporta (4).")
                .satisfies(noCampo("codigo"));

        verify(produtoRepository, never()).save(any());
    }

    /** O tamanho da etiqueta so vale para o produto vendido na balanca; o limite e inclusivo. */
    @Test
    void codigoQueCabeNaEtiquetaOuSemBalancaSalva() {
        cadastroPermitido();
        when(tamanhoDoCodigoNaEtiqueta.digitosCodigo(EMPRESA_ID)).thenReturn(4);

        assertThat(cadastrar(requestComUN().codigoDoProduto(9999).vendidoBalanca(true).build()).getCodigo())
                .isEqualTo(9999);
        assertThat(cadastrar(requestComUN().codigoDoProduto(12345).vendidoBalanca(false).build()).getCodigo())
                .isEqualTo(12345);
        verify(tamanhoDoCodigoNaEtiqueta).digitosCodigo(EMPRESA_ID);
    }

    /** Review Focus 5: produto antigo (sem codigo) editado com codigo nulo e balanca false. */
    @Test
    void produtoAntigoSemCodigoSalva() {
        produtoExistente(existente().numero(3));
        edicaoPermitida();

        Produto atualizado = atualizar(requestComUN().nome("Arroz").codigoDoProduto(null).vendidoBalanca(false)
                .build());

        assertThat(atualizado.getCodigo()).isNull();
        assertThat(atualizado.isVendidoBalanca()).isFalse();
        assertThat(atualizado.getNumero()).isEqualTo(3L);
        verify(produtoRepository, never()).nomeDoProdutoComCodigo(any(), any(), any());
        verifyNoInteractions(tamanhoDoCodigoNaEtiqueta);
    }

    @Test
    void balancaAusenteValeFalse() {
        cadastroPermitido();

        assertThat(cadastrar(requestComUN().codigoDoProduto(10).vendidoBalanca(null).build()).isVendidoBalanca())
                .isFalse();
    }

    /**
     * Cadastro simultaneo com o mesmo codigo: o banco recusa por
     * {@code uq_produto_empresa_codigo} e a resposta e o mesmo 409 com o nome,
     * lido numa transacao nova (a do cadastro foi abortada).
     */
    @Test
    void codigoGravadoAoMesmoTempoPorOutroProduto_409ComNome() {
        unidadeDaEmpresa(un);
        when(empresaRepository.findById(EMPRESA_ID)).thenReturn(Optional.of(empresa));
        when(produtoRepository.save(any(Produto.class))).thenThrow(violacaoDe("uq_produto_empresa_codigo"));
        when(produtoRepository.nomeDoProdutoComCodigoEmNovaTransacao(EMPRESA_ID, 542, null))
                .thenReturn(Optional.of("Açúcar a granel"));

        assertThatThrownBy(() -> cadastrar(requestComUN().codigoDoProduto(542).build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Este código já está em uso no produto Açúcar a granel.")
                .satisfies(noCampo("codigo"));
    }

    /** Outra violacao (ex.: SKU gravado ao mesmo tempo) segue para o tratamento generico (409 sem campo). */
    @Test
    void outraViolacaoNaoViraConflitoDeCodigo() {
        unidadeDaEmpresa(un);
        when(empresaRepository.findById(EMPRESA_ID)).thenReturn(Optional.of(empresa));
        DataIntegrityViolationException violacao = violacaoDe("uq_produto_empresa_sku");
        when(produtoRepository.save(any(Produto.class))).thenThrow(violacao);

        assertThatThrownBy(() -> cadastrar(requestComUN().codigoDoProduto(542).sku("SKU-1").build()))
                .isSameAs(violacao);
        verify(produtoRepository, never()).nomeDoProdutoComCodigoEmNovaTransacao(any(), any(), any());
    }

    /**
     * O nome da constraint vem do servidor ({@code PSQLException}), nao do texto
     * da mensagem: com o PostgreSQL em portugues, o Hibernate nao extrai o nome
     * (aqui, {@code null}) e a corrida continua reconhecida.
     */
    @Test
    void corridaReconhecidaPeloNomeDaConstraintDoServidor() {
        unidadeDaEmpresa(un);
        when(empresaRepository.findById(EMPRESA_ID)).thenReturn(Optional.of(empresa));
        when(produtoRepository.save(any(Produto.class)))
                .thenThrow(violacaoComMensagemEmPortugues("uq_produto_empresa_codigo"));
        when(produtoRepository.nomeDoProdutoComCodigoEmNovaTransacao(EMPRESA_ID, 542, null))
                .thenReturn(Optional.of("Açúcar a granel"));

        assertThatThrownBy(() -> cadastrar(requestComUN().codigoDoProduto(542).build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Este código já está em uso no produto Açúcar a granel.")
                .satisfies(noCampo("codigo"));
    }

    @Test
    void outraConstraintDoServidorNaoViraConflitoDeCodigo() {
        unidadeDaEmpresa(un);
        when(empresaRepository.findById(EMPRESA_ID)).thenReturn(Optional.of(empresa));
        DataIntegrityViolationException violacao = violacaoComMensagemEmPortugues("uq_produto_empresa_sku");
        when(produtoRepository.save(any(Produto.class))).thenThrow(violacao);

        assertThatThrownBy(() -> cadastrar(requestComUN().codigoDoProduto(542).build())).isSameAs(violacao);
        verify(produtoRepository, never()).nomeDoProdutoComCodigoEmNovaTransacao(any(), any(), any());
    }

    /**
     * Fase B3: cadastro simultaneo com o mesmo codigo de barras numa embalagem.
     * O banco recusa por {@code uq_codigo_barras_empresa} e a resposta e o 409
     * com o dono (lido numa transacao nova) no campo da lista da embalagem.
     */
    @Test
    void codigoDeBarrasGravadoAoMesmoTempoNaEmbalagem_409ComODono() {
        UnidadeMedida cx = unidade(12L, empresa, "CX");
        unidadeDaEmpresa(un);
        unidadeDaEmpresa(cx);
        when(empresaRepository.findById(EMPRESA_ID)).thenReturn(Optional.of(empresa));
        when(produtoRepository.save(any(Produto.class))).thenThrow(violacaoDe("uq_codigo_barras_empresa"));
        when(produtoRepository.codigosEmUsoEmNovaTransacao(eq(EMPRESA_ID), any(), any()))
                .thenReturn(List.of(new CodigoDeBarrasEmUso(EAN8_VALIDO, "Bravecto", "CX", new BigDecimal("3.000"),
                        "UN")));

        assertThatThrownBy(() -> cadastrar(requestComUN().codigosBarras(EAN13_VALIDO)
                .embalagens(new com.geitus.app.catalog.dto.EmbalagemRequest(null, cx.getUuid(), new BigDecimal("3"),
                        null, false, List.of(EAN8_VALIDO)))
                .build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Este código já está em uso na embalagem CX c/ 3 UN do produto Bravecto.")
                .satisfies(noCampo("embalagens[0].codigosBarras"));
    }

    /**
     * Revisao da B3: com embalagens, a unicidade adiada e conferida dentro do
     * salvamento; a violacao segue para o 409 generico, nunca para o commit.
     */
    @Test
    void unicidadeAdiadaDasEmbalagensConferidaAntesDoCommit() {
        UnidadeMedida cx = unidade(12L, empresa, "CX");
        unidadeDaEmpresa(un);
        unidadeDaEmpresa(cx);
        when(empresaRepository.findById(EMPRESA_ID)).thenReturn(Optional.of(empresa));
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));
        DataIntegrityViolationException violacao = violacaoDe("uq_embalagem_produto_unidade_quantidade");
        doThrow(violacao).when(produtoRepository).conferirUnicidadeDasEmbalagensAgora();

        assertThatThrownBy(() -> cadastrar(requestComUN()
                .embalagens(new com.geitus.app.catalog.dto.EmbalagemRequest(null, cx.getUuid(), new BigDecimal("3"),
                        null, false, List.of()))
                .build()))
                .isSameAs(violacao);
    }

    @Test
    void semEmbalagensNaoConfereAUnicidadeAdiada() {
        cadastroPermitido();

        cadastrar(requestComUN().build());

        verify(produtoRepository, never()).conferirUnicidadeDasEmbalagensAgora();
    }

    /** Na corrida pelo codigo da unidade, sem dono na releitura (o outro mudou no meio tempo): 409 sem nome. */
    @Test
    void codigoDeBarrasEmCorridaSemDonoNaReleitura_409SemNome() {
        unidadeDaEmpresa(un);
        when(empresaRepository.findById(EMPRESA_ID)).thenReturn(Optional.of(empresa));
        when(produtoRepository.save(any(Produto.class)))
                .thenThrow(violacaoComMensagemEmPortugues("uq_codigo_barras_empresa"));

        assertThatThrownBy(() -> cadastrar(requestComUN().codigosBarras(EAN13_VALIDO).build()))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Este código de barras já está em uso em outro produto.")
                .satisfies(noCampo("codigosBarras"));
    }

    /** Como chega do driver com {@code lc_messages} em portugues: o Hibernate nao acha o nome no texto. */
    private static DataIntegrityViolationException violacaoComMensagemEmPortugues(String constraint) {
        PSQLException doServidor = new PSQLException(new ServerErrorMessage("SERRO\0C23505\0Mduplicar valor da "
                + "chave viola a restrição de unicidade\0n" + constraint + "\0"));
        return new DataIntegrityViolationException("could not execute statement",
                new ConstraintViolationException("duplicar valor da chave", doServidor, null));
    }

    private static DataIntegrityViolationException violacaoDe(String constraint) {
        return new DataIntegrityViolationException("could not execute statement",
                new ConstraintViolationException("duplicate key", new SQLException(), constraint));
    }

    private void usuarioAtivoDaEmpresa(Long idUsuario) {
        Usuario usuario = mock(Usuario.class);
        when(usuario.isAtivo()).thenReturn(true);
        when(usuario.getEmpresaId()).thenReturn(EMPRESA_ID);
        when(usuarioRepository.findById(idUsuario)).thenReturn(Optional.of(usuario));
    }
}
