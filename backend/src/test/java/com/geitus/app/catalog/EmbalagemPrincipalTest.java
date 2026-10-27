package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;

/** {@link Produto#embalagemPrincipal()}: a de compra, senao a primeira da lista (spec de Produtos). */
class EmbalagemPrincipalTest {

    private Empresa empresa;
    private UnidadeMedida un;
    private UnidadeMedida cx;
    private UnidadeMedida fd;

    @BeforeEach
    void montarUnidades() {
        empresa = new Empresa("Empresa");
        un = new UnidadeMedida(empresa, "UN", "Unidade", false);
        cx = new UnidadeMedida(empresa, "CX", "Caixa", false);
        fd = new UnidadeMedida(empresa, "FD", "Fardo", false);
    }

    @Test
    void semEmbalagemNaoHaPrincipal() {
        assertThat(ProdutoTesteBuilder.produto(empresa, un).build().embalagemPrincipal()).isEmpty();
    }

    @Test
    void semDeCompraEhAPrimeira() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, un)
                .embalagem(cx, "6", null, false)
                .embalagem(fd, "12", null, false)
                .build();

        assertThat(produto.embalagemPrincipal()).hasValueSatisfying(
                principal -> assertThat(principal.getUnidade().getSigla()).isEqualTo("CX"));
    }

    @Test
    void aDeCompraVemAntesDaPrimeira() {
        Produto produto = ProdutoTesteBuilder.produto(empresa, un)
                .embalagem(cx, "6", null, false)
                .embalagem(fd, "12", null, true)
                .build();

        assertThat(produto.embalagemPrincipal()).hasValueSatisfying(
                principal -> assertThat(principal.getUnidade().getSigla()).isEqualTo("FD"));
    }
}
