package com.geitus.app.catalog;

import static com.geitus.app.catalog.ProdutoRequestBuilder.comUnidade;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

import org.assertj.core.api.ThrowingConsumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.categoria.CategoriaService;
import com.geitus.app.catalog.dto.CodigoBarrasResponse;
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

    private ProdutoService produtoService;

    private Empresa empresa;
    private UnidadeMedida un;
    private UUID produtoUuid;

    @BeforeEach
    void setUp() {
        produtoService = new ProdutoService(produtoRepository, empresaRepository, usuarioRepository,
                unidadeService, categoriaService);
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
    private Produto produtoExistente(ProdutoTesteBuilder builder) {
        Produto produto = builder.build();
        produtoUuid = produto.getUuid();
        when(produtoRepository.findByUuidAndEmpresa_Id(produtoUuid, EMPRESA_ID)).thenReturn(Optional.of(produto));
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
        return produtoService.cadastrar(EMPRESA_ID, request);
    }

    private Produto atualizar(ProdutoRequest request) {
        return produtoService.atualizarDadosBasicos(EMPRESA_ID, produtoUuid, request);
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

        Produto produto = produtoService.cadastrar(2L, comUnidade(unDaEmpresa2.getUuid()).sku("SKU-1").build());

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

    @Test
    void atualizarProdutoDeOutraEmpresaDeveFalhar() {
        produtoUuid = UUID.randomUUID();
        when(produtoRepository.findByUuidAndEmpresa_Id(produtoUuid, EMPRESA_ID)).thenReturn(Optional.empty());

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
                usuarioRepository, unidadeService, categoriaService) {
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

    // ---------- Resolucao da empresa a partir do usuario autenticado ----------

    @Test
    void cadastrarParaUsuarioInativoDeveFalharComCredenciaisInvalidas() {
        Usuario usuarioInativo = org.mockito.Mockito.mock(Usuario.class);
        when(usuarioInativo.isAtivo()).thenReturn(false);
        when(usuarioRepository.findById(9L)).thenReturn(Optional.of(usuarioInativo));

        assertThatThrownBy(() -> produtoService.cadastrarParaUsuario(9L, requestComUN().build()))
                .isInstanceOf(CredenciaisInvalidasException.class);

        verify(produtoRepository, never()).save(any());
    }

    private void usuarioAtivoDaEmpresa(Long idUsuario) {
        Usuario usuario = org.mockito.Mockito.mock(Usuario.class);
        when(usuario.isAtivo()).thenReturn(true);
        when(usuario.getEmpresaId()).thenReturn(EMPRESA_ID);
        when(usuarioRepository.findById(idUsuario)).thenReturn(Optional.of(usuario));
    }
}
