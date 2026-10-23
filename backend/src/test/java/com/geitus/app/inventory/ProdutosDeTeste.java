package com.geitus.app.inventory;

import java.math.BigDecimal;

import org.springframework.beans.BeanUtils;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.catalog.DadosProduto;
import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;

/**
 * Fixtures dos testes unitarios do estoque: empresa, unidade, produto e saldo
 * com ids internos preenchidos (sem banco).
 */
final class ProdutosDeTeste {

    private ProdutosDeTeste() {
        // Apenas metodos estaticos.
    }

    static Empresa empresa(Long id) {
        Empresa empresa = new Empresa("Empresa " + id);
        ReflectionTestUtils.setField(empresa, "id", id);
        return empresa;
    }

    static UnidadeMedida unidade(Empresa empresa, String sigla, boolean fracionada) {
        UnidadeMedida unidade = new UnidadeMedida(empresa, sigla, "Unidade " + sigla, fracionada);
        ReflectionTestUtils.setField(unidade, "id", 10L);
        return unidade;
    }

    /** Produto minimo (nome, preco e unidade) com o id interno e o controle de estoque informados. */
    static Produto produto(Empresa empresa, UnidadeMedida unidade, Long id, boolean controlaEstoque) {
        DadosProduto dados = new DadosProduto("Arroz", null, null, null, null, unidade, null, null, null,
                new BigDecimal("10.00"), null, null, null, null, null, null, null, null, null, null, null,
                controlaEstoque, null, false);
        // O numero de registro (V11) acompanha o id: unico entre os produtos do teste.
        Produto produto = new Produto(empresa, id, dados);
        ReflectionTestUtils.setField(produto, "id", id);
        return produto;
    }

    /** Linha de saldo como lida do banco (a entidade so nasce pelo INSERT nativo). */
    static EstoqueSaldo saldo(Produto produto, String saldo) {
        EstoqueSaldo linha = BeanUtils.instantiateClass(EstoqueSaldo.class);
        ReflectionTestUtils.setField(linha, "empresaId", produto.getEmpresaId());
        ReflectionTestUtils.setField(linha, "produtoId", produto.getId());
        ReflectionTestUtils.setField(linha, "saldo", new BigDecimal(saldo));
        return linha;
    }
}
