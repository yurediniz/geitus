package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;

/** Preco efetivo da embalagem (docs/modules/produtos-embalagens.md, 3.1). */
class PrecoDaEmbalagemTest {

    private static final PrecoAplicado UNIDADE_NORMAL = new PrecoAplicado(new BigDecimal("89.90"), OrigemPreco.NORMAL);

    @Test
    void precoProprioVale() {
        assertThat(PrecoDaEmbalagem.calcular(new BigDecimal("209.90"), new BigDecimal("3"), UNIDADE_NORMAL))
                .isEqualTo(new PrecoDaEmbalagem(new BigDecimal("209.90"), OrigemPrecoEmbalagem.PROPRIO));
    }

    /** A promocao da unidade nao altera o preco proprio. */
    @Test
    void precoProprioIgnoraAPromocao() {
        PrecoAplicado promocional = new PrecoAplicado(new BigDecimal("79.90"), OrigemPreco.PROMOCIONAL);

        assertThat(PrecoDaEmbalagem.calcular(new BigDecimal("209.90"), new BigDecimal("3"), promocional).origem())
                .isEqualTo(OrigemPrecoEmbalagem.PROPRIO);
    }

    @Test
    void semPrecoProprioValeQuantidadeVezesOPrecoDaUnidade() {
        PrecoDaEmbalagem preco = PrecoDaEmbalagem.calcular(null, new BigDecimal("3.000"), UNIDADE_NORMAL);

        assertThat(preco.preco()).isEqualByComparingTo("269.70");
        assertThat(preco.preco().scale()).isEqualTo(2);
        assertThat(preco.origem()).isEqualTo(OrigemPrecoEmbalagem.UNIDADE);
    }

    @Test
    void semPrecoProprioComAPromocaoDaUnidade() {
        PrecoAplicado promocional = new PrecoAplicado(new BigDecimal("79.90"), OrigemPreco.PROMOCIONAL);

        assertThat(PrecoDaEmbalagem.calcular(null, new BigDecimal("3"), promocional))
                .isEqualTo(new PrecoDaEmbalagem(new BigDecimal("239.70"), OrigemPrecoEmbalagem.PROMOCAO_DA_UNIDADE));
    }

    /** 25,5 x 12,99 = 331,245: meio para cima. */
    @Test
    void arredondaACentavosMeioParaCima() {
        PrecoAplicado unidade = new PrecoAplicado(new BigDecimal("12.99"), OrigemPreco.NORMAL);

        assertThat(PrecoDaEmbalagem.calcular(null, new BigDecimal("25.5"), unidade).preco())
                .isEqualByComparingTo("331.25");
    }

    // ---------- Preco vigente da unidade (sem o atacado) ----------

    @Test
    void vigenteSemAtacadoUsaAPromocaoVigenteENuncaOAtacado() {
        Empresa empresa = new Empresa("Empresa");
        UnidadeMedida un = new UnidadeMedida(empresa, "UN", "Unidade", false);
        LocalDate hoje = LocalDate.of(2026, 10, 24);
        Produto comPromocao = ProdutoTesteBuilder.produto(empresa, un).precoVenda("89.90")
                .promocao("79.90", hoje.minusDays(1), hoje.plusDays(1)).atacado("70.00", "2").build();
        Produto promocaoVencida = ProdutoTesteBuilder.produto(empresa, un).precoVenda("89.90")
                .promocao("79.90", hoje.minusDays(5), hoje.minusDays(1)).atacado("70.00", "2").build();

        assertThat(PrecoDeVenda.vigenteSemAtacado(comPromocao, hoje))
                .isEqualTo(new PrecoAplicado(new BigDecimal("79.90"), OrigemPreco.PROMOCIONAL));
        assertThat(PrecoDeVenda.vigenteSemAtacado(promocaoVencida, hoje))
                .isEqualTo(new PrecoAplicado(new BigDecimal("89.90"), OrigemPreco.NORMAL));
    }

    /** Promocao de um dia so (inicio = fim = hoje): vale hoje. */
    @Test
    void vigenteSemAtacadoComPromocaoSoDeHoje() {
        Empresa empresa = new Empresa("Empresa");
        UnidadeMedida un = new UnidadeMedida(empresa, "UN", "Unidade", false);
        LocalDate hoje = LocalDate.of(2026, 10, 24);
        Produto promocaoDeHoje = ProdutoTesteBuilder.produto(empresa, un).precoVenda("89.90")
                .promocao("79.90", hoje, hoje).build();

        assertThat(PrecoDeVenda.vigenteSemAtacado(promocaoDeHoje, hoje).origem()).isEqualTo(OrigemPreco.PROMOCIONAL);
    }
}
