package com.upeflow.erpell.product;

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

import com.upeflow.erpell.company.Empresa;
import com.upeflow.erpell.company.EmpresaRepository;

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

    private ProdutoService produtoService;

    @BeforeEach
    void setUp() {
        produtoService = new ProdutoService(produtoRepository, empresaRepository);
    }

    private Empresa empresaComId(Long id) {
        Empresa empresa = new Empresa("Empresa " + id);
        ReflectionTestUtils.setField(empresa, "id", id);
        return empresa;
    }

    private Produto produtoComId(Long id, Empresa empresa, String sku, String codigoBarras) {
        Produto produto = new Produto(empresa, "Produto Existente", new BigDecimal("10.00"));
        ReflectionTestUtils.setField(produto, "id", id);
        produto.setSku(sku);
        produto.setCodigoBarras(codigoBarras);
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
        when(produtoRepository.existsBySkuAndEmpresaId("SKU-1", 1L)).thenReturn(true);

        assertThatThrownBy(() -> produtoService.cadastrar(1L, "Produto", null, null,
                new BigDecimal("10"), null, null, null, "SKU-1"))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void cadastrarComMesmoSkuEmEmpresasDiferentesDevePermitir() {
        // O SKU "SKU-1" existe em outra empresa (1), mas o cadastro e feito na
        // empresa 2: a checagem de unicidade deve considerar apenas a empresa
        // informada, entao a consulta para a empresa 2 retorna "nao existe".
        when(produtoRepository.existsBySkuAndEmpresaId("SKU-1", 2L)).thenReturn(false);

        Empresa empresa2 = empresaComId(2L);
        when(empresaRepository.findById(2L)).thenReturn(Optional.of(empresa2));
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));

        Produto produto = produtoService.cadastrar(2L, "Produto", null, null,
                new BigDecimal("10"), null, null, null, "SKU-1");

        assertThat(produto.getSku()).isEqualTo("SKU-1");
        assertThat(produto.getEmpresaId()).isEqualTo(2L);
        verify(produtoRepository).existsBySkuAndEmpresaId("SKU-1", 2L);
        verify(produtoRepository, never()).existsBySkuAndEmpresaId(eq("SKU-1"), eq(1L));
    }

    @Test
    void cadastrarComCodigoBarrasDuplicadoNaMesmaEmpresaDeveFalhar() {
        when(produtoRepository.existsByCodigoBarrasAndEmpresaId("789123", 1L)).thenReturn(true);

        assertThatThrownBy(() -> produtoService.cadastrar(1L, "Produto", null, null,
                new BigDecimal("10"), null, null, "789123", null))
                .isInstanceOf(RegraDeNegocioException.class);

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
        verify(produtoRepository, never()).existsBySkuAndEmpresaId(any(), anyLong());
        verify(produtoRepository, never()).existsByCodigoBarrasAndEmpresaId(any(), anyLong());
    }

    @Test
    void atualizarProdutoDeOutraEmpresaDeveFalhar() {
        when(produtoRepository.findByIdAndEmpresaId(5L, 1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> produtoService.atualizarDadosBasicos(1L, 5L, "Novo Nome", null, null,
                new BigDecimal("10"), null, null, null, null))
                .isInstanceOf(ProdutoNaoEncontradoException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void atualizarProdutoDentroDaEmpresaCorretaDeveAlterarDados() {
        Empresa empresa = empresaComId(1L);
        Produto produtoExistente = produtoComId(5L, empresa, null, null);
        when(produtoRepository.findByIdAndEmpresaId(5L, 1L)).thenReturn(Optional.of(produtoExistente));
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
        when(produtoRepository.findByIdAndEmpresaId(5L, 1L)).thenReturn(Optional.of(produtoExistente));
        when(produtoRepository.existsBySkuAndEmpresaIdAndIdNot("SKU-DE-OUTRO", 1L, 5L)).thenReturn(true);

        assertThatThrownBy(() -> produtoService.atualizarDadosBasicos(1L, 5L, "Produto", null, null,
                new BigDecimal("10"), null, null, null, "SKU-DE-OUTRO"))
                .isInstanceOf(RegraDeNegocioException.class);

        verify(produtoRepository, never()).save(any());
    }

    @Test
    void atualizarMantendoOProprioSkuNaoDeveFalhar() {
        Empresa empresa = empresaComId(1L);
        Produto produtoExistente = produtoComId(5L, empresa, "SKU-PROPRIO", null);
        when(produtoRepository.findByIdAndEmpresaId(5L, 1L)).thenReturn(Optional.of(produtoExistente));
        when(produtoRepository.existsBySkuAndEmpresaIdAndIdNot("SKU-PROPRIO", 1L, 5L)).thenReturn(false);
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));

        Produto atualizado = produtoService.atualizarDadosBasicos(1L, 5L, "Produto Atualizado", null, null,
                new BigDecimal("15"), null, null, null, "SKU-PROPRIO");

        assertThat(atualizado.getSku()).isEqualTo("SKU-PROPRIO");
        verify(produtoRepository).existsBySkuAndEmpresaIdAndIdNot("SKU-PROPRIO", 1L, 5L);
        verify(produtoRepository).save(any(Produto.class));
    }

    @Test
    void inativarEReativarProdutoDevemAlterarStatus() {
        Empresa empresa = empresaComId(1L);
        Produto produtoExistente = produtoComId(5L, empresa, null, null);
        when(produtoRepository.findByIdAndEmpresaId(5L, 1L)).thenReturn(Optional.of(produtoExistente));
        when(produtoRepository.save(any(Produto.class))).thenAnswer(invocacao -> invocacao.getArgument(0));

        Produto inativado = produtoService.inativar(1L, 5L);
        assertThat(inativado.isAtivo()).isFalse();

        Produto reativado = produtoService.reativar(1L, 5L);
        assertThat(reativado.isAtivo()).isTrue();
    }

    @Test
    void buscarPorIdDeOutraEmpresaDeveLancarProdutoNaoEncontrado() {
        when(produtoRepository.findByIdAndEmpresaId(5L, 2L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> produtoService.buscarPorId(2L, 5L))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
    }
}
