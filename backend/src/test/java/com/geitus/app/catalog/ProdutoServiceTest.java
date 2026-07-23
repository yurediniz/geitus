package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Testa as regras do {@link ProdutoService}: validacoes de cadastro/atualizacao
 * e isolamento por empresa (DEC-016).
 */
@ExtendWith(MockitoExtension.class)
class ProdutoServiceTest {

    @Mock
    private ProdutoRepository produtoRepository;

    @Mock
    private EmpresaRepository empresaRepository;

    @Mock
    private UsuarioRepository usuarioRepository;

    private ProdutoService produtoService;

    @BeforeEach
    void setUp() {
        produtoService = new ProdutoService(produtoRepository, empresaRepository, usuarioRepository);
    }

    private Empresa empresaComId(Long id) {
        Empresa empresa = new Empresa("Empresa " + id);
        ReflectionTestUtils.setField(empresa, "id", id);
        return empresa;
    }

    private Produto produtoComId(Long id, Empresa empresa, String sku, String codigoBarras) {
        Produto produto = new Produto(empresa, "Produto Existente", null, null, new BigDecimal("10.00"),
                null, null, codigoBarras, sku);
        ReflectionTestUtils.setField(produto, "id", id);
        return produto;
    }

    @Test
    void cadastrarProdutoValidoDeveSalvar() {
        Empresa empresa = empresaComId(1L);
        when(empresaRepository.findById(1L)).thenReturn(Optional.of(empresa));
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));

        Produto produto = produtoService.cadastrar(1L, "Arroz 5kg", "Mercearia", "UN",
                new BigDecimal("25.90"), new BigDecimal("18.00"), new BigDecimal("2"), "789123", "SKU-1");

        assertThat(produto.getNome()).isEqualTo("Arroz 5kg");
        assertThat(produto.getEmpresaId()).isEqualTo(1L);
        assertThat(produto.isAtivo()).isTrue();
        verify(produtoRepository).save(any(Produto.class));
    }

    @Test
    void cadastrarComNomeVazioDeveFalhar() {
        assertThatThrownBy(() -> produtoService.cadastrar(1L, "   ", null, null,
                new BigDecimal("10"), null, null, null, null))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComPrecoVendaNegativoDeveFalhar() {
        assertThatThrownBy(() -> produtoService.cadastrar(1L, "Produto", null, null,
                new BigDecimal("-1"), null, null, null, null))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComCustoNegativoDeveFalhar() {
        assertThatThrownBy(() -> produtoService.cadastrar(1L, "Produto", null, null,
                new BigDecimal("10"), new BigDecimal("-0.01"), null, null, null))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComEstoqueMinimoNegativoDeveFalhar() {
        assertThatThrownBy(() -> produtoService.cadastrar(1L, "Produto", null, null,
                new BigDecimal("10"), null, new BigDecimal("-1"), null, null))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComSkuDuplicadoNaMesmaEmpresaDeveFalhar() {
        when(produtoRepository.existsBySkuAndEmpresa_Id("SKU-1", 1L)).thenReturn(true);

        assertThatThrownBy(() -> produtoService.cadastrar(1L, "Produto", null, null,
                new BigDecimal("10"), null, null, null, "SKU-1"))
                .isInstanceOf(ProdutoConflitoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComMesmoSkuEmEmpresasDiferentesDevePermitir() {
        // O SKU "SKU-1" existe em outra empresa (1), mas o cadastro e feito na
        // empresa 2: a checagem de unicidade deve considerar apenas a empresa
        // informada, entao a consulta para a empresa 2 retorna "nao existe".
        when(produtoRepository.existsBySkuAndEmpresa_Id("SKU-1", 2L)).thenReturn(false);

        Empresa empresa2 = empresaComId(2L);
        when(empresaRepository.findById(2L)).thenReturn(Optional.of(empresa2));
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));

        Produto produto = produtoService.cadastrar(2L, "Produto", null, null,
                new BigDecimal("10"), null, null, null, "SKU-1");

        assertThat(produto.getSku()).isEqualTo("SKU-1");
        assertThat(produto.getEmpresaId()).isEqualTo(2L);
        verify(produtoRepository).existsBySkuAndEmpresa_Id("SKU-1", 2L);
        verify(produtoRepository, never()).existsBySkuAndEmpresa_Id(eq("SKU-1"), eq(1L));
    }

    @Test
    void cadastrarComCodigoBarrasDuplicadoNaMesmaEmpresaDeveFalhar() {
        when(produtoRepository.existsByCodigoBarrasAndEmpresa_Id("789123", 1L)).thenReturn(true);

        assertThatThrownBy(() -> produtoService.cadastrar(1L, "Produto", null, null,
                new BigDecimal("10"), null, null, "789123", null))
                .isInstanceOf(ProdutoConflitoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarSemSkuESemCodigoBarrasDevePermitir() {
        Empresa empresa = empresaComId(1L);
        when(empresaRepository.findById(1L)).thenReturn(Optional.of(empresa));
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));

        Produto produto = produtoService.cadastrar(1L, "Produto Sem Codigos", null, null,
                new BigDecimal("10"), null, null, null, null);

        assertThat(produto.getSku()).isNull();
        assertThat(produto.getCodigoBarras()).isNull();
        verify(produtoRepository, never()).existsBySkuAndEmpresa_Id(any(), anyLong());
        verify(produtoRepository, never()).existsByCodigoBarrasAndEmpresa_Id(any(), anyLong());
    }

    @Test
    void atualizarProdutoDeOutraEmpresaDeveFalhar() {
        when(produtoRepository.findByIdAndEmpresa_Id(5L, 1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> produtoService.atualizarDadosBasicos(1L, 5L, "Novo Nome", null, null,
                new BigDecimal("10"), null, null, null, null))
                .isInstanceOf(ProdutoNaoEncontradoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void atualizarProdutoDentroDaEmpresaCorretaDeveAlterarDados() {
        Empresa empresa = empresaComId(1L);
        Produto produtoExistente = produtoComId(5L, empresa, null, null);
        when(produtoRepository.findByIdAndEmpresa_Id(5L, 1L)).thenReturn(Optional.of(produtoExistente));
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));

        Produto atualizado = produtoService.atualizarDadosBasicos(1L, 5L, "Nome Atualizado", "Categoria",
                "UN", new BigDecimal("30.00"), new BigDecimal("20.00"), new BigDecimal("1"), null, null);

        assertThat(atualizado.getNome()).isEqualTo("Nome Atualizado");
        assertThat(atualizado.getPrecoVenda()).isEqualByComparingTo("30.00");
    }

    @Test
    void atualizarComSkuJaUsadoPorOutroProdutoDaMesmaEmpresaDeveFalhar() {
        Empresa empresa = empresaComId(1L);
        Produto produtoExistente = produtoComId(5L, empresa, "SKU-PROPRIO", null);
        when(produtoRepository.findByIdAndEmpresa_Id(5L, 1L)).thenReturn(Optional.of(produtoExistente));
        when(produtoRepository.existsBySkuAndEmpresa_IdAndIdNot("SKU-DE-OUTRO", 1L, 5L)).thenReturn(true);

        assertThatThrownBy(() -> produtoService.atualizarDadosBasicos(1L, 5L, "Produto", null, null,
                new BigDecimal("10"), null, null, null, "SKU-DE-OUTRO"))
                .isInstanceOf(ProdutoConflitoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void atualizarComCodigoBarrasJaUsadoPorOutroProdutoDaMesmaEmpresaDeveFalhar() {
        Empresa empresa = empresaComId(1L);
        Produto produtoExistente = produtoComId(5L, empresa, null, "111222333");
        when(produtoRepository.findByIdAndEmpresa_Id(5L, 1L)).thenReturn(Optional.of(produtoExistente));
        when(produtoRepository.existsByCodigoBarrasAndEmpresa_IdAndIdNot("999888777", 1L, 5L)).thenReturn(true);

        assertThatThrownBy(() -> produtoService.atualizarDadosBasicos(1L, 5L, "Produto", null, null,
                new BigDecimal("10"), null, null, "999888777", null))
                .isInstanceOf(ProdutoConflitoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void atualizarMantendoOProprioCodigoBarrasNaoDeveFalhar() {
        Empresa empresa = empresaComId(1L);
        Produto produtoExistente = produtoComId(5L, empresa, null, "111222333");
        when(produtoRepository.findByIdAndEmpresa_Id(5L, 1L)).thenReturn(Optional.of(produtoExistente));
        when(produtoRepository.existsByCodigoBarrasAndEmpresa_IdAndIdNot("111222333", 1L, 5L)).thenReturn(false);
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));

        Produto atualizado = produtoService.atualizarDadosBasicos(1L, 5L, "Produto Atualizado", null, null,
                new BigDecimal("15"), null, null, "111222333", null);

        assertThat(atualizado.getCodigoBarras()).isEqualTo("111222333");
        verify(produtoRepository).existsByCodigoBarrasAndEmpresa_IdAndIdNot("111222333", 1L, 5L);
        verify(produtoRepository).save(any(Produto.class));
    }

    @Test
    void atualizarMantendoOProprioSkuNaoDeveFalhar() {
        Empresa empresa = empresaComId(1L);
        Produto produtoExistente = produtoComId(5L, empresa, "SKU-PROPRIO", null);
        when(produtoRepository.findByIdAndEmpresa_Id(5L, 1L)).thenReturn(Optional.of(produtoExistente));
        when(produtoRepository.existsBySkuAndEmpresa_IdAndIdNot("SKU-PROPRIO", 1L, 5L)).thenReturn(false);
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));

        Produto atualizado = produtoService.atualizarDadosBasicos(1L, 5L, "Produto Atualizado", null, null,
                new BigDecimal("15"), null, null, null, "SKU-PROPRIO");

        assertThat(atualizado.getSku()).isEqualTo("SKU-PROPRIO");
        verify(produtoRepository).existsBySkuAndEmpresa_IdAndIdNot("SKU-PROPRIO", 1L, 5L);
        verify(produtoRepository).save(any(Produto.class));
    }

    @Test
    void inativarEReativarProdutoDevemAlterarStatus() {
        Empresa empresa = empresaComId(1L);
        Produto produtoExistente = produtoComId(5L, empresa, null, null);
        when(produtoRepository.findByIdAndEmpresa_Id(5L, 1L)).thenReturn(Optional.of(produtoExistente));
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));

        Produto inativado = produtoService.inativar(1L, 5L);
        assertThat(inativado.isAtivo()).isFalse();

        Produto reativado = produtoService.reativar(1L, 5L);
        assertThat(reativado.isAtivo()).isTrue();
    }

    @Test
    void buscarPorIdDeOutraEmpresaDeveLancarProdutoNaoEncontrado() {
        when(produtoRepository.findByIdAndEmpresa_Id(5L, 2L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> produtoService.buscarPorId(2L, 5L))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
    }

    @Test
    void listarSemTermoDeBuscaDeveUsarQuerySemParametroDeBusca() {
        // Regressao do bug "function lower(bytea) does not exist": sem termo de
        // busca (null ou em branco), a query que usa :busca NAO deve ser chamada.
        when(produtoRepository.buscarPorEmpresa(1L, true)).thenReturn(java.util.List.of());

        produtoService.listarPorEmpresaComFiltros(1L, null, true);
        produtoService.listarPorEmpresaComFiltros(1L, "   ", true);

        verify(produtoRepository, org.mockito.Mockito.times(2)).buscarPorEmpresa(1L, true);
        verify(produtoRepository, never()).buscarPorEmpresaComBusca(any(), any(), any());
    }

    @Test
    void listarComTermoDeBuscaDeveUsarQueryComBusca() {
        when(produtoRepository.buscarPorEmpresaComBusca(1L, "arroz", null)).thenReturn(java.util.List.of());

        produtoService.listarPorEmpresaComFiltros(1L, " arroz ", null);

        verify(produtoRepository).buscarPorEmpresaComBusca(1L, "arroz", null);
        verify(produtoRepository, never()).buscarPorEmpresa(any(), any());
    }

    // ---------- Normalizacao de campos opcionais (vazio/branco -> null; trim) ----------

    @Test
    void cadastrarComCamposOpcionaisEmBrancoDeveNormalizarParaNull() {
        Empresa empresa = empresaComId(1L);
        when(empresaRepository.findById(1L)).thenReturn(Optional.of(empresa));
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));

        Produto produto = produtoService.cadastrar(1L, "Produto", "  ", "", new BigDecimal("10"),
                null, null, "   ", "");

        assertThat(produto.getCategoria()).isNull();
        assertThat(produto.getUnidade()).isNull();
        assertThat(produto.getSku()).isNull();
        assertThat(produto.getCodigoBarras()).isNull();
        // Sem SKU/codigo apos normalizacao, a checagem de unicidade nem e consultada.
        verify(produtoRepository, never()).existsBySkuAndEmpresa_Id(any(), anyLong());
        verify(produtoRepository, never()).existsByCodigoBarrasAndEmpresa_Id(any(), anyLong());
    }

    @Test
    void cadastrarDeveAplicarTrimNosCamposInformados() {
        Empresa empresa = empresaComId(1L);
        when(empresaRepository.findById(1L)).thenReturn(Optional.of(empresa));
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));

        Produto produto = produtoService.cadastrar(1L, "  Produto  ", "  Mercearia  ", "  UN  ",
                new BigDecimal("10"), null, null, "  789123  ", "  SKU-1  ");

        assertThat(produto.getNome()).isEqualTo("Produto");
        assertThat(produto.getCategoria()).isEqualTo("Mercearia");
        assertThat(produto.getUnidade()).isEqualTo("UN");
        assertThat(produto.getSku()).isEqualTo("SKU-1");
        assertThat(produto.getCodigoBarras()).isEqualTo("789123");
    }

    @Test
    void atualizarComCamposOpcionaisEmBrancoDeveNormalizarParaNull() {
        Empresa empresa = empresaComId(1L);
        Produto produtoExistente = produtoComId(5L, empresa, "SKU-ANTIGO", "111222333");
        when(produtoRepository.findByIdAndEmpresa_Id(5L, 1L)).thenReturn(Optional.of(produtoExistente));
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));

        Produto atualizado = produtoService.atualizarDadosBasicos(1L, 5L, "Produto", "  ", "",
                new BigDecimal("10"), null, null, "   ", "");

        assertThat(atualizado.getCategoria()).isNull();
        assertThat(atualizado.getUnidade()).isNull();
        assertThat(atualizado.getSku()).isNull();
        assertThat(atualizado.getCodigoBarras()).isNull();
    }

    // ---------- Resolucao da empresa a partir do usuario autenticado ----------

    @Test
    void cadastrarParaUsuarioInativoDeveFalharComCredenciaisInvalidas() {
        Usuario usuarioInativo = org.mockito.Mockito.mock(Usuario.class);
        when(usuarioInativo.isAtivo()).thenReturn(false);
        when(usuarioRepository.findById(9L)).thenReturn(Optional.of(usuarioInativo));

        assertThatThrownBy(() -> produtoService.cadastrarParaUsuario(9L, "Produto", null, null,
                new BigDecimal("10"), null, null, null, null))
                .isInstanceOf(CredenciaisInvalidasException.class);

        verify(produtoRepository, never()).save(any());
    }
}
