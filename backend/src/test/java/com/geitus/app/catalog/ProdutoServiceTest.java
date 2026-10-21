package com.geitus.app.catalog;

import static com.geitus.app.catalog.ProdutoRequestBuilder.comUnidade;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.categoria.CategoriaService;
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
 * texto, isolamento por empresa (DEC-016) e os vinculos com unidade de venda,
 * categoria e unidade de compra (docs/modules/categorias-e-unidades.md, 5.1).
 */
@ExtendWith(MockitoExtension.class)
class ProdutoServiceTest {

    private static final Long EMPRESA_ID = 1L;
    private static final Long PRODUTO_ID = 5L;

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

    private Produto produtoExistente(String sku, String codigoBarras) {
        return produtoExistente(un, null, sku, codigoBarras);
    }

    private Produto produtoExistente(UnidadeMedida unidade, Categoria categoria, String sku, String codigoBarras) {
        Produto produto = new Produto(empresa, "Produto Existente", unidade, categoria, null, null,
                new BigDecimal("10.00"), null, null, codigoBarras, sku, null, null, null, null, null);
        ReflectionTestUtils.setField(produto, "id", PRODUTO_ID);
        when(produtoRepository.findByIdAndEmpresa_Id(PRODUTO_ID, EMPRESA_ID)).thenReturn(Optional.of(produto));
        return produto;
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
        when(empresaRepository.findById(EMPRESA_ID)).thenReturn(Optional.of(empresa));
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
        return produtoService.atualizarDadosBasicos(EMPRESA_ID, PRODUTO_ID, request);
    }

    // ---------- Cadastro: regras basicas ----------

    @Test
    void cadastrarProdutoValidoDeveSalvar() {
        unidadeDaEmpresa(un);
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().nome("Arroz 5kg").precoVenda("25.90").custo("18.00")
                .estoqueMinimo("2").codigoBarras("789123").sku("SKU-1").build());

        assertThat(produto.getNome()).isEqualTo("Arroz 5kg");
        assertThat(produto.getEmpresaId()).isEqualTo(EMPRESA_ID);
        assertThat(produto.getUnidade()).isSameAs(un);
        assertThat(produto.getCategoria()).isNull();
        assertThat(produto.getUnidadeCompra()).isNull();
        assertThat(produto.getFatorConversao()).isNull();
        assertThat(produto.isAtivo()).isTrue();
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
                .isInstanceOf(ProdutoConflitoException.class);

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
    void cadastrarComCodigoBarrasDuplicadoNaMesmaEmpresaDeveFalhar() {
        when(produtoRepository.existsByCodigoBarrasAndEmpresa_Id("789123", EMPRESA_ID)).thenReturn(true);

        assertThatThrownBy(() -> cadastrar(requestComUN().codigoBarras("789123").build()))
                .isInstanceOf(ProdutoConflitoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarSemSkuESemCodigoBarrasDevePermitir() {
        unidadeDaEmpresa(un);
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().nome("Produto Sem Codigos").build());

        assertThat(produto.getSku()).isNull();
        assertThat(produto.getCodigoBarras()).isNull();
        verify(produtoRepository, never()).existsBySkuAndEmpresa_Id(any(), anyLong());
        verify(produtoRepository, never()).existsByCodigoBarrasAndEmpresa_Id(any(), anyLong());
    }

    // ---------- Atualizacao: regras basicas ----------

    @Test
    void atualizarProdutoDeOutraEmpresaDeveFalhar() {
        when(produtoRepository.findByIdAndEmpresa_Id(PRODUTO_ID, EMPRESA_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> atualizar(requestComUN().nome("Novo Nome").build()))
                .isInstanceOf(ProdutoNaoEncontradoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void atualizarProdutoDentroDaEmpresaCorretaDeveAlterarDados() {
        produtoExistente(null, null);
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
        produtoExistente("SKU-PROPRIO", null);
        when(produtoRepository.existsBySkuAndEmpresa_IdAndIdNot("SKU-DE-OUTRO", EMPRESA_ID, PRODUTO_ID))
                .thenReturn(true);

        assertThatThrownBy(() -> atualizar(requestComUN().sku("SKU-DE-OUTRO").build()))
                .isInstanceOf(ProdutoConflitoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void atualizarComCodigoBarrasJaUsadoPorOutroProdutoDaMesmaEmpresaDeveFalhar() {
        produtoExistente(null, "111222333");
        when(produtoRepository.existsByCodigoBarrasAndEmpresa_IdAndIdNot("999888777", EMPRESA_ID, PRODUTO_ID))
                .thenReturn(true);

        assertThatThrownBy(() -> atualizar(requestComUN().codigoBarras("999888777").build()))
                .isInstanceOf(ProdutoConflitoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void atualizarMantendoOProprioCodigoBarrasNaoDeveFalhar() {
        produtoExistente(null, "111222333");
        when(produtoRepository.existsByCodigoBarrasAndEmpresa_IdAndIdNot("111222333", EMPRESA_ID, PRODUTO_ID))
                .thenReturn(false);
        unidadeDaEmpresa(un);
        salvamentoDevolveOProduto();

        Produto atualizado = atualizar(requestComUN().nome("Produto Atualizado").precoVenda("15")
                .codigoBarras("111222333").build());

        assertThat(atualizado.getCodigoBarras()).isEqualTo("111222333");
        verify(produtoRepository).existsByCodigoBarrasAndEmpresa_IdAndIdNot("111222333", EMPRESA_ID, PRODUTO_ID);
        verify(produtoRepository).save(any(Produto.class));
    }

    @Test
    void atualizarMantendoOProprioSkuNaoDeveFalhar() {
        produtoExistente("SKU-PROPRIO", null);
        when(produtoRepository.existsBySkuAndEmpresa_IdAndIdNot("SKU-PROPRIO", EMPRESA_ID, PRODUTO_ID))
                .thenReturn(false);
        unidadeDaEmpresa(un);
        salvamentoDevolveOProduto();

        Produto atualizado = atualizar(requestComUN().nome("Produto Atualizado").precoVenda("15")
                .sku("SKU-PROPRIO").build());

        assertThat(atualizado.getSku()).isEqualTo("SKU-PROPRIO");
        verify(produtoRepository).existsBySkuAndEmpresa_IdAndIdNot("SKU-PROPRIO", EMPRESA_ID, PRODUTO_ID);
        verify(produtoRepository).save(any(Produto.class));
    }

    @Test
    void inativarEReativarProdutoDevemAlterarStatus() {
        produtoExistente(null, null);
        salvamentoDevolveOProduto();

        Produto inativado = produtoService.inativar(EMPRESA_ID, PRODUTO_ID);
        assertThat(inativado.isAtivo()).isFalse();

        Produto reativado = produtoService.reativar(EMPRESA_ID, PRODUTO_ID);
        assertThat(reativado.isAtivo()).isTrue();
    }

    @Test
    void buscarPorIdDeOutraEmpresaDeveLancarProdutoNaoEncontrado() {
        when(produtoRepository.findByIdAndEmpresa_Id(PRODUTO_ID, 2L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> produtoService.buscarPorId(2L, PRODUTO_ID))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
    }

    // ---------- Listagem ----------

    @Test
    void listarSemTermoDeBuscaDeveUsarQuerySemParametroDeBusca() {
        // Regressao do bug "function lower(bytea) does not exist": sem termo de
        // busca (null ou em branco), a query que usa :busca NAO deve ser chamada.
        when(produtoRepository.buscarPorEmpresa(EMPRESA_ID, true)).thenReturn(List.of());

        produtoService.listarPorEmpresaComFiltros(EMPRESA_ID, null, true);
        produtoService.listarPorEmpresaComFiltros(EMPRESA_ID, "   ", true);

        verify(produtoRepository, times(2)).buscarPorEmpresa(EMPRESA_ID, true);
        verify(produtoRepository, never()).buscarPorEmpresaComBusca(any(), any(), any());
    }

    @Test
    void listarComTermoDeBuscaDeveUsarQueryComBusca() {
        when(produtoRepository.buscarPorEmpresaComBusca(EMPRESA_ID, "arroz", null)).thenReturn(List.of());

        produtoService.listarPorEmpresaComFiltros(EMPRESA_ID, " arroz ", null);

        verify(produtoRepository).buscarPorEmpresaComBusca(EMPRESA_ID, "arroz", null);
        verify(produtoRepository, never()).buscarPorEmpresa(any(), any());
    }

    @Test
    void listarParaUsuarioMontaAArvoreUmaUnicaVezComOCaminhoDaCategoria() {
        usuarioAtivoDaEmpresa(9L);
        Categoria racao = categoria(100L, empresa, null, "Ração");
        Categoria umida = categoria(101L, empresa, racao, "Úmida");
        Produto comCategoria = new Produto(empresa, "Sachê", un, umida, null, null, new BigDecimal("3.00"),
                null, null, null, null, null, null, null, null, null);
        Produto semCategoria = new Produto(empresa, "Avulso", un, null, null, null, new BigDecimal("1.00"),
                null, null, null, null, null, null, null, null, null);
        when(produtoRepository.buscarPorEmpresa(EMPRESA_ID, null)).thenReturn(List.of(comCategoria, semCategoria));
        arvoreDaEmpresa(racao, umida);

        List<ProdutoResponse> produtos = produtoService.listarParaUsuario(9L, null, null);

        assertThat(produtos).hasSize(2);
        assertThat(produtos.get(0).categoria().caminho()).isEqualTo("Ração › Úmida");
        assertThat(produtos.get(0).unidade().sigla()).isEqualTo("UN");
        assertThat(produtos.get(1).categoria()).isNull();
        verify(categoriaService, times(1)).arvoreDaEmpresa(EMPRESA_ID);
    }

    // ---------- Normalizacao de campos opcionais (vazio/branco -> null; trim) ----------

    @Test
    void cadastrarComCamposOpcionaisEmBrancoDeveNormalizarParaNull() {
        unidadeDaEmpresa(un);
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().codigoBarras("   ").sku("").marca("  ").descricao("   ").build());

        assertThat(produto.getSku()).isNull();
        assertThat(produto.getCodigoBarras()).isNull();
        assertThat(produto.getMarca()).isNull();
        assertThat(produto.getDescricao()).isNull();
        // Sem SKU/codigo apos normalizacao, a checagem de unicidade nem e consultada.
        verify(produtoRepository, never()).existsBySkuAndEmpresa_Id(any(), anyLong());
        verify(produtoRepository, never()).existsByCodigoBarrasAndEmpresa_Id(any(), anyLong());
    }

    @Test
    void cadastrarDeveAplicarTrimNosCamposInformados() {
        unidadeDaEmpresa(un);
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().nome("  Produto  ").codigoBarras("  789123  ")
                .sku("  SKU-1  ").marca("  Tio João  ").descricao("  Arroz tipo 1  ").build());

        assertThat(produto.getNome()).isEqualTo("Produto");
        assertThat(produto.getSku()).isEqualTo("SKU-1");
        assertThat(produto.getCodigoBarras()).isEqualTo("789123");
        assertThat(produto.getMarca()).isEqualTo("Tio João");
        assertThat(produto.getDescricao()).isEqualTo("Arroz tipo 1");
    }

    @Test
    void atualizarComCamposOpcionaisEmBrancoDeveNormalizarParaNull() {
        produtoExistente("SKU-ANTIGO", "111222333");
        unidadeDaEmpresa(un);
        salvamentoDevolveOProduto();

        Produto atualizado = atualizar(requestComUN().codigoBarras("   ").sku("").marca("  ").descricao("   ")
                .build());

        assertThat(atualizado.getSku()).isNull();
        assertThat(atualizado.getCodigoBarras()).isNull();
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
        unidadeDaEmpresa(un);
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().estoqueMinimo("10").estoqueMaximo("10").build());

        assertThat(produto.getEstoqueMinimo()).isEqualByComparingTo("10");
        assertThat(produto.getEstoqueMaximo()).isEqualByComparingTo("10");
        verify(produtoRepository).save(any(Produto.class));
    }

    @Test
    void cadastrarComEstoqueMaximoSemEstoqueMinimoNaoDeveAplicarRegraCruzada() {
        unidadeDaEmpresa(un);
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().estoqueMaximo("2").build());

        assertThat(produto.getEstoqueMaximo()).isEqualByComparingTo("2");
        assertThat(produto.getEstoqueMinimo()).isNull();
    }

    @Test
    void cadastrarComCamposCadastraisValidosDevePreservarOsValores() {
        unidadeDaEmpresa(un);
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
        unidadeDaEmpresa(un);
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().precoVenda("10.00").precoMinimo("10.00").build());

        assertThat(produto.getPrecoMinimo()).isEqualByComparingTo("10.00");
    }

    @Test
    void atualizarComPrecoMinimoMaiorQuePrecoVendaDeveFalhar() {
        produtoExistente(null, null);

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
        unidadeDaEmpresa(un);
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().compra(un.getUuid(), "1.0000").build());

        assertThat(produto.getUnidadeCompra()).isSameAs(un);
        assertThat(produto.getFatorConversao()).isEqualByComparingTo("1");
    }

    @Test
    void unidadeCompraEFatorSaoGravados() {
        UnidadeMedida cx = unidade(12L, empresa, "CX");
        unidadeDaEmpresa(un);
        unidadeDaEmpresa(cx);
        cadastroPermitido();

        Produto produto = cadastrar(requestComUN().compra(cx.getUuid(), "12").build());

        assertThat(produto.getUnidadeCompra()).isSameAs(cx);
        assertThat(produto.getFatorConversao()).isEqualByComparingTo("12");
    }

    @Test
    void unidadeInativaSoSeJaForAAtual() {
        // Review Focus 4. Cadastrar com unidade inativa -> 400.
        UnidadeMedida inativa = unidade(13L, empresa, "PCT");
        inativa.inativar();
        unidadeDaEmpresa(inativa);
        assertThatThrownBy(() -> cadastrar(comUnidade(inativa.getUuid()).build()))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Esta unidade está inativa. Escolha uma unidade ativa.");

        // Editar mantendo a mesma unidade, inativada depois -> salva.
        produtoExistente(inativa, null, null, null);
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

        Produto existente = produtoExistente(null, null);
        existente.atualizarDadosBasicos("Produto Existente", un, null, caixaInativa, new BigDecimal("12"),
                new BigDecimal("10.00"), null, null, null, null, null, null, null, null, null);
        salvamentoDevolveOProduto();
        Produto atualizado = atualizar(requestComUN().compra(caixaInativa.getUuid(), "6").build());
        assertThat(atualizado.getUnidadeCompra()).isSameAs(caixaInativa);
        assertThat(atualizado.getFatorConversao()).isEqualByComparingTo("6");
    }

    @Test
    void categoriaNaoSelecionavelSoSeJaForAAtual() {
        // Review Focus 4: categoria inativa (ou sob ancestral inativo).
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
        produtoExistente(un, umida, null, null);
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
        unidadeDaEmpresa(un);
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
