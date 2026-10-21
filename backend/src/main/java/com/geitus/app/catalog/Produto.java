package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * Produto fisico do Geitus.
 *
 * <p>Todo produto nasce vinculado a uma empresa (tenant), conforme DEC-016, e
 * nunca deve ser lido ou alterado fora da empresa a que pertence. A empresa e o
 * {@code uuid} publico (DEC-019) sao imutaveis apos a criacao; os demais dados so
 * mudam via {@link #atualizarDadosBasicos} e {@link #substituirCodigos} (nao ha
 * setters individuais), garantindo que as alteracoes passem pelas regras do
 * {@code ProdutoService}.
 *
 * <p>Unidade de venda (obrigatoria), categoria e unidade de compra sao
 * cadastros da mesma empresa (docs/modules/categorias-e-unidades.md, secao 5);
 * o service valida a empresa e a V6 garante no banco com FKs compostas
 * {@code (empresa_id, id)}.
 *
 * <p>Fase B (V7, docs/modules/produtos-identificacao-e-formulario.md): o
 * produto tem de 0 a 20 {@link ProdutoCodigoBarras} — parte do cadastro, por
 * isso {@code cascade} e {@code orphanRemoval} —, nome curto e fornecedor
 * principal.
 *
 * <p>Nao deve ser exposta diretamente na API: o {@code ProdutoController} usa
 * DTOs ({@code ProdutoRequest}/{@code ProdutoResponse}).
 */
@Entity
@Table(name = "produtos")
public class Produto {

    /** Tamanho maximo do nome curto (coluna {@code nome_curto VARCHAR(30)}, V7). */
    public static final int TAMANHO_NOME_CURTO = 30;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, updatable = false)
    private UUID uuid;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "empresa_id", nullable = false, updatable = false)
    private Empresa empresa;

    @Column(nullable = false, length = 150)
    private String nome;

    @Column(name = "nome_curto", length = TAMANHO_NOME_CURTO)
    private String nomeCurto;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "unidade_id", nullable = false)
    private UnidadeMedida unidade;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "categoria_id")
    private Categoria categoria;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "unidade_compra_id")
    private UnidadeMedida unidadeCompra;

    @Column(name = "fator_conversao", precision = 12, scale = 4)
    private BigDecimal fatorConversao;

    @Column(length = 100)
    private String marca;

    @Column(length = 100)
    private String fornecedor;

    @Column(length = 1000)
    private String descricao;

    @Column(name = "preco_venda", nullable = false, precision = 12, scale = 2)
    private BigDecimal precoVenda;

    @Column(precision = 12, scale = 2)
    private BigDecimal custo;

    @Column(name = "estoque_minimo", precision = 12, scale = 3)
    private BigDecimal estoqueMinimo;

    @Column(name = "estoque_maximo", precision = 12, scale = 3)
    private BigDecimal estoqueMaximo;

    @Column(name = "ponto_reposicao", precision = 12, scale = 3)
    private BigDecimal pontoReposicao;

    @Column(name = "preco_minimo", precision = 12, scale = 2)
    private BigDecimal precoMinimo;

    @Column(length = 50)
    private String sku;

    @Column(nullable = false)
    private boolean ativo = true;

    @OneToMany(mappedBy = "produto", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("ordem")
    private List<ProdutoCodigoBarras> codigosBarras = new ArrayList<>();

    @Column(name = "criado_em", nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    @Column(name = "atualizado_em")
    private LocalDateTime atualizadoEm;

    protected Produto() {
        // Construtor exigido pelo JPA.
    }

    /**
     * Cria um produto ja com os dados do cadastro e um {@code uuid} novo. O
     * service e responsavel por validar as regras de negocio antes de instanciar.
     */
    public Produto(Empresa empresa, DadosProduto dados) {
        this.empresa = empresa;
        this.uuid = UUID.randomUUID();
        this.ativo = true;
        atualizarDadosBasicos(dados);
    }

    @PrePersist
    void aoCriar() {
        this.criadoEm = LocalDateTime.now();
    }

    /**
     * Carimbo de toda alteracao gravada. O service faz {@code flush} antes de
     * montar a resposta do PATCH/inativar/reativar, entao a resposta ja traz
     * este valor (o mesmo que fica no banco).
     */
    @PreUpdate
    void aoAtualizar() {
        this.atualizadoEm = LocalDateTime.now();
    }

    /**
     * Atualiza os dados do cadastro. Chamado pelo service apos as validacoes de
     * regra de negocio (nome, preco, unicidade de SKU, unidade/categoria da
     * empresa, coerencia da conversao de compra) ja terem sido feitas.
     */
    public void atualizarDadosBasicos(DadosProduto dados) {
        this.nome = dados.nome();
        this.nomeCurto = dados.nomeCurto();
        this.marca = dados.marca();
        this.fornecedor = dados.fornecedor();
        this.descricao = dados.descricao();
        this.unidade = dados.unidade();
        this.categoria = dados.categoria();
        this.unidadeCompra = dados.unidadeCompra();
        this.fatorConversao = dados.fatorConversao();
        this.precoVenda = dados.precoVenda();
        this.custo = dados.custo();
        this.precoMinimo = dados.precoMinimo();
        this.estoqueMinimo = dados.estoqueMinimo();
        this.estoqueMaximo = dados.estoqueMaximo();
        this.pontoReposicao = dados.pontoReposicao();
        this.sku = dados.sku();
    }

    /**
     * Substitui a lista de codigos de barras pela informada, na ordem (o
     * primeiro e o principal). A reconciliacao e por {@code codigo}: um codigo
     * que o produto ja tem continua sendo a MESMA linha (so a ordem muda e o
     * formato gravado e preservado), os ausentes saem da lista e sao apagados
     * ({@code orphanRemoval}) e apenas os novos sao criados.
     *
     * <p>Recriar a linha de um codigo mantido violaria
     * {@code uq_codigo_barras_empresa}, porque no flush o Hibernate insere antes
     * de apagar os orfaos. Os codigos chegam validados pelo service
     * (normalizados, sem repeticao, no maximo 20, unicos na empresa).
     *
     * <p>Os codigos ficam em outra tabela, entao mudar so eles nao deixaria o
     * produto "sujo" e o {@code @PreUpdate} nao rodaria. Por isso, num produto
     * ja gravado cuja sequencia de codigos (texto e ordem) mudou, o
     * {@code atualizadoEm} e carimbado aqui — o que tambem dispara o UPDATE do
     * produto. Produto ainda nao gravado nao carimba: {@code atualizado_em}
     * continua nulo ate a primeira alteracao depois do cadastro.
     */
    public void substituirCodigos(List<CodigoBarrasValidado> informados) {
        List<String> codigosAnteriores = textosDosCodigos();
        List<ProdutoCodigoBarras> reconciliados = new ArrayList<>(informados.size());
        for (int ordem = 0; ordem < informados.size(); ordem++) {
            reconciliados.add(codigoReposicionadoOuNovo(informados.get(ordem), ordem));
        }
        codigosBarras.clear();
        codigosBarras.addAll(reconciliados);
        if (jaGravado() && !codigosAnteriores.equals(textosDosCodigos())) {
            this.atualizadoEm = LocalDateTime.now();
        }
    }

    private List<String> textosDosCodigos() {
        return codigosBarras.stream().map(ProdutoCodigoBarras::getCodigo).toList();
    }

    private boolean jaGravado() {
        return id != null;
    }

    private ProdutoCodigoBarras codigoReposicionadoOuNovo(CodigoBarrasValidado informado, int ordem) {
        Optional<ProdutoCodigoBarras> gravado = codigoGravado(informado.codigo());
        if (gravado.isEmpty()) {
            return new ProdutoCodigoBarras(this, informado.codigo(), informado.formato(), ordem);
        }
        gravado.get().posicionarEm(ordem);
        return gravado.get();
    }

    /** Codigo de barras que este produto ja tem com exatamente este texto, se houver. */
    public Optional<ProdutoCodigoBarras> codigoGravado(String codigo) {
        return codigosBarras.stream()
                .filter(codigoDoProduto -> codigoDoProduto.getCodigo().equals(codigo))
                .findFirst();
    }

    /**
     * Nome usado por cupom e PDV (spec 4.1): o nome curto, ou os 30 primeiros
     * caracteres do nome, aparados.
     */
    public String nomeCurtoEfetivo() {
        if (nomeCurto != null) {
            return nomeCurto;
        }
        return nome.substring(0, Math.min(TAMANHO_NOME_CURTO, nome.length())).strip();
    }

    public void inativar() {
        this.ativo = false;
    }

    public void ativar() {
        this.ativo = true;
    }

    /** Id interno (PK, DEC-015): uso apenas no backend, nunca exposto na API. */
    public Long getId() {
        return id;
    }

    /** Identificador publico do produto nas rotas e respostas da API. */
    public UUID getUuid() {
        return uuid;
    }

    public Empresa getEmpresa() {
        return empresa;
    }

    public Long getEmpresaId() {
        return empresa == null ? null : empresa.getId();
    }

    public String getNome() {
        return nome;
    }

    /** Nome curto informado, ou {@code null}; para exibir, use {@link #nomeCurtoEfetivo()}. */
    public String getNomeCurto() {
        return nomeCurto;
    }

    /** Unidade de venda (sempre presente). */
    public UnidadeMedida getUnidade() {
        return unidade;
    }

    /** Categoria, ou {@code null} se o produto nao tiver categoria. */
    public Categoria getCategoria() {
        return categoria;
    }

    /** Unidade de compra, ou {@code null}; quando presente, {@link #getFatorConversao()} tambem esta. */
    public UnidadeMedida getUnidadeCompra() {
        return unidadeCompra;
    }

    /** Unidades de venda contidas em 1 unidade de compra, ou {@code null}. */
    public BigDecimal getFatorConversao() {
        return fatorConversao;
    }

    public String getMarca() {
        return marca;
    }

    /** Fornecedor principal (texto livre), ou {@code null}. */
    public String getFornecedor() {
        return fornecedor;
    }

    public String getDescricao() {
        return descricao;
    }

    public BigDecimal getPrecoVenda() {
        return precoVenda;
    }

    public BigDecimal getCusto() {
        return custo;
    }

    public BigDecimal getEstoqueMinimo() {
        return estoqueMinimo;
    }

    public BigDecimal getEstoqueMaximo() {
        return estoqueMaximo;
    }

    public BigDecimal getPontoReposicao() {
        return pontoReposicao;
    }

    public BigDecimal getPrecoMinimo() {
        return precoMinimo;
    }

    /** Codigos de barras na ordem (somente leitura; alterar via {@link #substituirCodigos}). */
    public List<ProdutoCodigoBarras> getCodigosBarras() {
        return Collections.unmodifiableList(codigosBarras);
    }

    public String getSku() {
        return sku;
    }

    public boolean isAtivo() {
        return ativo;
    }

    public LocalDateTime getCriadoEm() {
        return criadoEm;
    }

    public LocalDateTime getAtualizadoEm() {
        return atualizadoEm;
    }
}
