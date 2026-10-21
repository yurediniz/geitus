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
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import org.assertj.core.api.ListAssert;
import org.assertj.core.api.ThrowingConsumer;
import org.assertj.core.groups.Tuple;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
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
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

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

    private ProdutoService produtoService;

    private Empresa empresa;
    private UnidadeMedida un;
    private UUID produtoUuid;

    @BeforeEach
    void setUp() {
        produtoService = new ProdutoService(produtoRepository, empresaRepository, usuarioRepository,
                unidadeService, categoriaService, historicoPrecoRepository, RELOGIO);
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
        assertThat(produto.getUnidadeCompra()).isNull();
        assertThat(produto.getFatorConversao()).isNull();
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

    @Test
    void inativarNaoTravaOProduto() {
        produtoExistente();
        salvamentoDevolveOProduto();

        produtoService.inativar(EMPRESA_ID, produtoUuid);

        verify(produtoRepository, never()).buscarPorUuidParaAtualizar(any(), anyLong());
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
        ProdutoService comMovimentacao = new ProdutoService(produtoRepository, empresaRepository,
                usuarioRepository, unidadeService, categoriaService, historicoPrecoRepository, RELOGIO) {
            @Override
            boolean podeExcluir(Produto produto) {
                return false;
            }
        };
        produtoExistente();

        assertThatThrownBy(() -> comMovimentacao.excluir(ID_USUARIO, EMPRESA_ID, produtoUuid))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Este produto já teve movimentação e não pode ser excluído. "
                        + "Inative-o para que não apareça na venda.");

        verify(produtoRepository, never()).delete(any());
    }

    @Test
    void excluirDeOutraEmpresaLanca404() {
        UUID deOutraEmpresa = UUID.randomUUID();
        when(produtoRepository.findByUuidAndEmpresa_Id(deOutraEmpresa, EMPRESA_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> produtoService.excluir(ID_USUARIO, EMPRESA_ID, deOutraEmpresa))
                .isInstanceOf(ProdutoNaoEncontradoException.class);

        verify(produtoRepository, never()).delete(any());
    }

    @Test
    void podeExcluirNestaFaseSempreVerdadeiroERespostaInforma() {
        usuarioAtivoDaEmpresa(9L);
        produtoExistente();

        ProdutoResponse resposta = produtoService.buscarPorIdParaUsuario(9L, produtoUuid);

        assertThat(resposta.podeExcluir()).isTrue();
        assertThat(resposta.id()).isEqualTo(produtoUuid);
    }

    // ---------- Listagem ----------

    @Test
    void listarSemTermoDeBuscaDeveUsarQuerySemParametroDeBusca() {
        // Regressao do bug "function lower(bytea) does not exist": sem termo de
        // busca (null ou em branco), a query que usa os padroes NAO deve ser chamada.
        when(produtoRepository.buscarPorEmpresa(EMPRESA_ID, true)).thenReturn(List.of());

        produtoService.listarPorEmpresaComFiltros(EMPRESA_ID, null, true);
        produtoService.listarPorEmpresaComFiltros(EMPRESA_ID, "   ", true);

        verify(produtoRepository, times(2)).buscarPorEmpresa(EMPRESA_ID, true);
        verify(produtoRepository, never()).buscarPorEmpresaComBusca(any(), any(), any(), any());
    }

    @Test
    void listarComBuscaSoDeEspacosNaoSeparaveisUsaQuerySemBusca() {
        // Regressao: "\u00A0" passava no hasText, a normalizacao do codigo virava null e dava NPE (500).
        when(produtoRepository.buscarPorEmpresa(EMPRESA_ID, null)).thenReturn(List.of());

        produtoService.listarPorEmpresaComFiltros(EMPRESA_ID, "\u00A0", null);
        produtoService.listarPorEmpresaComFiltros(EMPRESA_ID, "\u2007", null);
        produtoService.listarPorEmpresaComFiltros(EMPRESA_ID, " \u202F ", null);

        verify(produtoRepository, times(3)).buscarPorEmpresa(EMPRESA_ID, null);
        verify(produtoRepository, never()).buscarPorEmpresaComBusca(any(), any(), any(), any());
    }

    @Test
    void listarComTermoDeBuscaDeveUsarPadroesEscapadosDeTextoEDeCodigo() {
        // DT-017: '%' e '_' digitados sao literais; o padrao de codigo vem normalizado (sem espacos).
        when(produtoRepository.buscarPorEmpresaComBusca(EMPRESA_ID, "%50\\%\\_ arroz%", "%50\\%\\_arroz%", null))
                .thenReturn(List.of());

        produtoService.listarPorEmpresaComFiltros(EMPRESA_ID, " 50%_ Arroz ", null);

        verify(produtoRepository).buscarPorEmpresaComBusca(EMPRESA_ID, "%50\\%\\_ arroz%", "%50\\%\\_arroz%", null);
        verify(produtoRepository, never()).buscarPorEmpresa(any(), any());
    }

    @Test
    void listarParaUsuarioMontaAArvoreUmaUnicaVezComOCaminhoDaCategoria() {
        usuarioAtivoDaEmpresa(9L);
        Categoria racao = categoria(100L, empresa, null, "Ração");
        Categoria umida = categoria(101L, empresa, racao, "Úmida");
        Produto comCategoria = ProdutoTesteBuilder.produto(empresa, un).nome("Sachê").categoria(umida)
                .precoVenda("3.00").codigo(EAN13_VALIDO).build();
        Produto semCategoria = ProdutoTesteBuilder.produto(empresa, un).nome("Avulso").precoVenda("1.00").build();
        when(produtoRepository.buscarPorEmpresa(EMPRESA_ID, null)).thenReturn(List.of(comCategoria, semCategoria));
        arvoreDaEmpresa(racao, umida);

        List<ProdutoResponse> produtos = produtoService.listarParaUsuario(9L, null, null);

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
        Produto vigente = ProdutoTesteBuilder.produto(empresa, un).nome("Vigente")
                .promocao("8.90", INICIO_PROMOCAO, FIM_PROMOCAO).build();
        Produto agendada = ProdutoTesteBuilder.produto(empresa, un).nome("Agendada")
                .promocao("8.90", LocalDate.of(2020, 3, 9), FIM_PROMOCAO).build();
        Produto semPromocao = ProdutoTesteBuilder.produto(empresa, un).nome("Sem promoção").build();
        when(produtoRepository.buscarPorEmpresa(EMPRESA_ID, null)).thenReturn(List.of(vigente, agendada, semPromocao));
        arvoreDaEmpresa();

        List<ProdutoResponse> produtos = produtoService.listarParaUsuario(9L, null, null);

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
    void unidadeCompraDeOutraEmpresaLanca404() {
        unidadeDaEmpresa(un);
        UUID compraDeOutraEmpresa = UUID.randomUUID();
        when(unidadeService.buscarDaEmpresa(EMPRESA_ID, compraDeOutraEmpresa))
                .thenThrow(new CatalogoNaoEncontradoException("Unidade de medida não encontrada."));

        assertThatThrownBy(() -> cadastrar(requestComUN().compra(compraDeOutraEmpresa, "12").build()))
                .isInstanceOf(CatalogoNaoEncontradoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void unidadeCompraSemFatorLanca400() {
        assertThatThrownBy(() -> cadastrar(requestComUN().compra(UUID.randomUUID(), null).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Informe a unidade de compra e o fator de conversão juntos.");

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void fatorSemUnidadeCompraLanca400() {
        assertThatThrownBy(() -> cadastrar(requestComUN().compra(null, "12").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Informe a unidade de compra e o fator de conversão juntos.");

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void fatorZeroOuNegativoLanca400MesmoSemBeanValidation() {
        UUID caixa = UUID.randomUUID();

        assertThatThrownBy(() -> cadastrar(requestComUN().compra(caixa, "0").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("O fator de conversão deve ser maior que zero.");
        assertThatThrownBy(() -> cadastrar(requestComUN().compra(caixa, "-2.5").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("O fator de conversão deve ser maior que zero.");
        // Mesma unidade com fator 0: o fator invalido e apontado primeiro.
        assertThatThrownBy(() -> cadastrar(requestComUN().compra(un.getUuid(), "0").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("O fator de conversão deve ser maior que zero.");

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void mesmaUnidadeComFatorDiferenteDeUmLanca400() {
        assertThatThrownBy(() -> cadastrar(requestComUN().compra(un.getUuid(), "12").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Quando a unidade de compra é a mesma de venda, o fator deve ser 1.");

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void mesmaUnidadeComFatorUmEPermitido() {
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().compra(un.getUuid(), "1.0000").build());

        assertThat(produto.getUnidadeCompra()).isSameAs(un);
        assertThat(produto.getFatorConversao()).isEqualByComparingTo("1");
    }

    @Test
    void unidadeCompraEFatorSaoGravados() {
        UnidadeMedida cx = unidade(12L, empresa, "CX");
        unidadeDaEmpresa(cx);
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().compra(cx.getUuid(), "12").build());

        assertThat(produto.getUnidadeCompra()).isSameAs(cx);
        assertThat(produto.getFatorConversao()).isEqualByComparingTo("12");
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
    void unidadeCompraInativaSoSeJaForAAtual() {
        UnidadeMedida caixaInativa = unidade(15L, empresa, "CX");
        caixaInativa.inativar();
        unidadeDaEmpresa(un);
        unidadeDaEmpresa(caixaInativa);

        assertThatThrownBy(() -> cadastrar(requestComUN().compra(caixaInativa.getUuid(), "12").build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Esta unidade de compra está inativa. Escolha uma unidade ativa.");

        produtoExistente(existente().compra(caixaInativa, "12"));
        salvamentoDevolveOProduto();
        Produto atualizado = atualizar(requestComUN().compra(caixaInativa.getUuid(), "6").build());
        assertThat(atualizado.getUnidadeCompra()).isSameAs(caixaInativa);
        assertThat(atualizado.getFatorConversao()).isEqualByComparingTo("6");
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
                new BigDecimal("10.00"), new BigDecimal("11.50"), "Ana Souza",
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

    private void usuarioAtivoDaEmpresa(Long idUsuario) {
        Usuario usuario = mock(Usuario.class);
        when(usuario.isAtivo()).thenReturn(true);
        when(usuario.getEmpresaId()).thenReturn(EMPRESA_ID);
        when(usuarioRepository.findById(idUsuario)).thenReturn(Optional.of(usuario));
    }
}
