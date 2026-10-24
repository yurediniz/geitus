package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;

/**
 * Monta entidades {@link Produto} nos testes sem repetir os componentes de
 * {@link DadosProduto}. Parte de um produto minimo valido (nome, preco e
 * unidade de venda) e cada teste ajusta so o que importa para ele.
 *
 * <p>O {@code numero} de registro (V11, unico por empresa) vem de uma sequencia
 * global dos testes, entao produtos salvos no mesmo banco nunca colidem; quem
 * precisa de um numero especifico usa {@link #numero(long)}.
 */
final class ProdutoTesteBuilder {

    private static final AtomicLong PROXIMO_NUMERO = new AtomicLong();

    private final Empresa empresa;
    private final UnidadeMedida unidade;
    private String nome = "Produto";
    private String nomeCurto;
    private String marca;
    private String fornecedor;
    private String descricao;
    private Categoria categoria;
    private BigDecimal precoVenda = new BigDecimal("10.00");
    private BigDecimal custo;
    private BigDecimal precoMinimo;
    private BigDecimal estoqueMinimo;
    private BigDecimal estoqueMaximo;
    private BigDecimal pontoReposicao;
    private String sku;
    private BigDecimal precoPromocional;
    private LocalDate promocaoInicio;
    private LocalDate promocaoFim;
    private BigDecimal precoAtacado;
    private BigDecimal quantidadeMinimaAtacado;
    private Long id;
    private long numero = PROXIMO_NUMERO.incrementAndGet();
    private boolean ativo = true;
    private boolean controlaEstoque = true;
    private Integer codigoDoProduto;
    private boolean vendidoBalanca;
    private final List<CodigoBarrasValidado> codigos = new ArrayList<>();

    private ProdutoTesteBuilder(Empresa empresa, UnidadeMedida unidade) {
        this.empresa = empresa;
        this.unidade = unidade;
    }

    static ProdutoTesteBuilder produto(Empresa empresa, UnidadeMedida unidade) {
        return new ProdutoTesteBuilder(empresa, unidade);
    }

    ProdutoTesteBuilder id(Long valor) {
        this.id = valor;
        return this;
    }

    ProdutoTesteBuilder numero(long valor) {
        this.numero = valor;
        return this;
    }

    ProdutoTesteBuilder nome(String valor) {
        this.nome = valor;
        return this;
    }

    ProdutoTesteBuilder nomeCurto(String valor) {
        this.nomeCurto = valor;
        return this;
    }

    ProdutoTesteBuilder marca(String valor) {
        this.marca = valor;
        return this;
    }

    ProdutoTesteBuilder fornecedor(String valor) {
        this.fornecedor = valor;
        return this;
    }

    ProdutoTesteBuilder descricao(String valor) {
        this.descricao = valor;
        return this;
    }

    ProdutoTesteBuilder categoria(Categoria valor) {
        this.categoria = valor;
        return this;
    }

    ProdutoTesteBuilder precoVenda(String valor) {
        this.precoVenda = new BigDecimal(valor);
        return this;
    }

    ProdutoTesteBuilder custo(String valor) {
        this.custo = valor == null ? null : new BigDecimal(valor);
        return this;
    }

    ProdutoTesteBuilder precoMinimo(String valor) {
        this.precoMinimo = new BigDecimal(valor);
        return this;
    }

    ProdutoTesteBuilder estoqueMinimo(String valor) {
        this.estoqueMinimo = new BigDecimal(valor);
        return this;
    }

    ProdutoTesteBuilder estoqueMaximo(String valor) {
        this.estoqueMaximo = new BigDecimal(valor);
        return this;
    }

    ProdutoTesteBuilder pontoReposicao(String valor) {
        this.pontoReposicao = new BigDecimal(valor);
        return this;
    }

    ProdutoTesteBuilder sku(String valor) {
        this.sku = valor;
        return this;
    }

    ProdutoTesteBuilder promocao(String preco, LocalDate inicio, LocalDate fim) {
        this.precoPromocional = new BigDecimal(preco);
        this.promocaoInicio = inicio;
        this.promocaoFim = fim;
        return this;
    }

    ProdutoTesteBuilder atacado(String preco, String quantidadeMinima) {
        this.precoAtacado = new BigDecimal(preco);
        this.quantidadeMinimaAtacado = new BigDecimal(quantidadeMinima);
        return this;
    }

    /** Codigo do produto (Fase B2); os codigos de barras usam {@link #codigo(String)}. */
    ProdutoTesteBuilder codigoDoProduto(Integer valor) {
        this.codigoDoProduto = valor;
        return this;
    }

    ProdutoTesteBuilder vendidoBalanca() {
        this.vendidoBalanca = true;
        return this;
    }

    ProdutoTesteBuilder semControleDeEstoque() {
        this.controlaEstoque = false;
        return this;
    }

    ProdutoTesteBuilder inativo() {
        this.ativo = false;
        return this;
    }

    /** Codigo com o formato detectado pela regra pura. */
    ProdutoTesteBuilder codigo(String codigo) {
        return codigo(codigo, CodigoBarras.detectarFormato(codigo));
    }

    /** Codigo com formato explicito (ex.: EAN-13 de digito invalido gravado como OUTRO pela migracao). */
    ProdutoTesteBuilder codigo(String codigo, FormatoCodigoBarras formato) {
        this.codigos.add(new CodigoBarrasValidado(codigo, formato));
        return this;
    }

    Produto build() {
        Produto produto = new Produto(empresa, numero, new DadosProduto(nome, nomeCurto, marca, fornecedor, descricao,
                unidade, categoria, precoVenda, custo, precoMinimo, estoqueMinimo,
                estoqueMaximo, pontoReposicao, sku, precoPromocional, promocaoInicio, promocaoFim, precoAtacado,
                quantidadeMinimaAtacado, controlaEstoque, codigoDoProduto, vendidoBalanca));
        produto.substituirCodigos(codigos);
        if (!ativo) {
            produto.inativar();
        }
        if (id != null) {
            ReflectionTestUtils.setField(produto, "id", id);
        }
        return produto;
    }
}
