package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.beans.BeanUtils;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.catalog.DadosProduto;
import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoEmbalagem;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;

/**
 * Produtos e embalagens dos testes unitarios do carrinho, com ids internos e
 * sem banco. Os precos e regras sao os informados; o resto fica vazio.
 */
final class ProdutosDeTeste {

    static final LocalDate HOJE = LocalDate.of(2026, 10, 24);

    private static final AtomicLong IDS = new AtomicLong(100);
    private static final Empresa EMPRESA = empresa();

    private ProdutosDeTeste() {
        // Apenas metodos estaticos.
    }

    /** Dados opcionais do produto de teste. */
    record Precos(String venda, String minimo, String promocional, String atacado, String minimoDoAtacado) {

        static Precos de(String venda) {
            return new Precos(venda, null, null, null, null);
        }

        Precos comMinimo(String valor) {
            return new Precos(venda, valor, promocional, atacado, minimoDoAtacado);
        }

        Precos comPromocao(String valor) {
            return new Precos(venda, minimo, valor, atacado, minimoDoAtacado);
        }

        Precos comAtacado(String valor, String quantidadeMinima) {
            return new Precos(venda, minimo, promocional, valor, quantidadeMinima);
        }
    }

    static UnidadeMedida unidade(String sigla, boolean fracionada) {
        UnidadeMedida unidade = new UnidadeMedida(EMPRESA, sigla, "Unidade " + sigla, fracionada);
        ReflectionTestUtils.setField(unidade, "id", IDS.incrementAndGet());
        return unidade;
    }

    static Produto produto(String nome, UnidadeMedida unidade, Precos precos) {
        long id = IDS.incrementAndGet();
        DadosProduto dados = new DadosProduto(nome, null, null, null, unidade, null, valor(precos.venda()), null,
                valor(precos.minimo()), null, null, null, null, valor(precos.promocional()),
                precos.promocional() == null ? null : HOJE.minusDays(1),
                precos.promocional() == null ? null : HOJE.plusDays(1), valor(precos.atacado()),
                valor(precos.minimoDoAtacado()), true, (int) id, false);
        Produto produto = new Produto(EMPRESA, id, dados, LocalDateTime.of(2026, 1, 2, 8, 0));
        ReflectionTestUtils.setField(produto, "id", id);
        return produto;
    }

    /** Embalagem do produto ({@code preco} nulo = calculado pela unidade), ja na lista dele. */
    static ProdutoEmbalagem embalagem(Produto produto, UnidadeMedida unidade, String quantidade, String preco) {
        ProdutoEmbalagem embalagem = BeanUtils.instantiateClass(ProdutoEmbalagem.class);
        ReflectionTestUtils.setField(embalagem, "id", IDS.incrementAndGet());
        ReflectionTestUtils.setField(embalagem, "uuid", UUID.randomUUID());
        ReflectionTestUtils.setField(embalagem, "produto", produto);
        ReflectionTestUtils.setField(embalagem, "unidade", unidade);
        ReflectionTestUtils.setField(embalagem, "quantidade", new BigDecimal(quantidade));
        ReflectionTestUtils.setField(embalagem, "preco", valor(preco));
        @SuppressWarnings("unchecked")
        List<ProdutoEmbalagem> embalagens = (List<ProdutoEmbalagem>) ReflectionTestUtils.getField(produto,
                "embalagens");
        embalagens.add(embalagem);
        return embalagem;
    }

    private static BigDecimal valor(String texto) {
        return texto == null ? null : new BigDecimal(texto);
    }

    private static Empresa empresa() {
        Empresa empresa = new Empresa("Empresa de teste");
        ReflectionTestUtils.setField(empresa, "id", 1L);
        return empresa;
    }
}
