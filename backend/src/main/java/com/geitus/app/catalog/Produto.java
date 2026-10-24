package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.hibernate.annotations.SQLRestriction;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.marca.Marca;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;
import com.geitus.app.shared.busca.TextoDeBusca;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * <p>Unidade de venda (obrigatoria) e categoria sao cadastros da mesma empresa (docs/modules/categorias-e-unidades.md, secao 5);
 * o service valida a empresa e a V6 garante no banco com FKs compostas
 * {@code (empresa_id, id)}.
 *
 * <p>Fase B (V7, docs/modules/produtos-identificacao-e-formulario.md): o
 * produto tem de 0 a 20 {@link ProdutoCodigoBarras} — parte do cadastro, por
 * isso {@code cascade} e {@code orphanRemoval} — e nome curto.
 *
 * <p>Fase D (V9, docs/modules/produtos-estoque.md): o produto tem a flag
 * {@code controlaEstoque}; o saldo fica no pacote {@code inventory}, derivado
 * de movimentos, e nunca e um campo do produto.
 *
 * <p>Fase E (V10, docs/modules/produtos-listagem.md): {@code buscaNormalizada}
 * e {@code nomeNormalizado} sao derivadas do cadastro e recalculadas a cada
 * {@link #atualizarDadosBasicos}, para a busca sem acento e a ordenacao da lista.
 *
 * <p>Fase B2 (V11, docs/modules/produtos-codigo-e-balanca.md): o {@code numero}
 * e o numero de registro 1, 2, 3... por empresa, gerado pelo {@code Numerador}
 * na criacao e imutavel ({@code updatable = false}; nao e a PK). O
 * {@code codigo} (1 a 999999, opcional) e o "vendido na balanca" sao dados do
 * cadastro.
 *
 * <p>Fase B3 (V12, docs/modules/produtos-embalagens.md): o produto tem de 0 a
 * 10 {@link ProdutoEmbalagem} (cascade e orphanRemoval), que substituem a
 * antiga unidade de compra + fator. A colecao {@code codigosBarras} so traz os
 * codigos da unidade de venda ({@code embalagem_id IS NULL}); os das
 * embalagens ficam em cada embalagem.
 *
 * <p>Fase B4 (V13, docs/modules/produtos-custo-entrada.md): o produto guarda a
 * origem do custo atual ({@link OrigemDoCusto}) e quando ela foi registrada.
 *
 * <p>Fase B5 (V14, docs/modules/fornecedores-e-marcas.md): a marca e um item
 * da arvore de marcas da empresa (o texto livre saiu); o produto tem a lista de
 * fornecedores ({@link ProdutoFornecedor}, so com o id do fornecedor: o
 * catalogo nao depende do pacote {@code supplier}) e, entre eles, o da ultima
 * compra, que a FK de tres colunas da V14 obriga a estar na lista.
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

    /** Fase B2 (V11): numero de registro por empresa, imutavel depois da criacao. */
    @Column(nullable = false, updatable = false)
    private Long numero;

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

    /** Fase B5 (V14): fabricante ou marca, qualquer nivel da arvore, ou {@code null}. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "marca_id")
    private Marca marca;

    @Column(length = 1000)
    private String descricao;

    @Column(name = "preco_venda", nullable = false, precision = 12, scale = 2)
    private BigDecimal precoVenda;

    @Column(precision = 12, scale = 2)
    private BigDecimal custo;

    /**
     * Fase B4 (V13): de onde veio o custo atual e quando; os dois nulos sem
     * custo ou com a origem desconhecida (produtos anteriores a V13). Mudam so
     * por {@link #registrarCustoDeEntrada} e {@link #atualizarDadosBasicos}.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "custo_origem", length = 20)
    private OrigemDoCusto custoOrigem;

    @Column(name = "custo_origem_em")
    private LocalDateTime custoOrigemEm;

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

    /** Fase B2 (V11): codigo do produto (1 a 999999), unico por empresa quando informado. */
    private Integer codigo;

    /** Fase B2 (V11): vendido na balanca (exige {@link #codigo}). */
    @Column(name = "vendido_balanca", nullable = false)
    private boolean vendidoBalanca;

    @Column(name = "preco_promocional", precision = 12, scale = 2)
    private BigDecimal precoPromocional;

    @Column(name = "promocao_inicio")
    private LocalDate promocaoInicio;

    @Column(name = "promocao_fim")
    private LocalDate promocaoFim;

    @Column(name = "preco_atacado", precision = 12, scale = 2)
    private BigDecimal precoAtacado;

    @Column(name = "quantidade_minima_atacado", precision = 12, scale = 3)
    private BigDecimal quantidadeMinimaAtacado;

    @Column(nullable = false)
    private boolean ativo = true;

    /** Fase D (V9): se o saldo do produto e controlado por movimentacoes. */
    @Column(name = "controla_estoque", nullable = false)
    private boolean controlaEstoque = true;

    /** So os codigos da unidade de venda: os das embalagens tambem tem {@code produto_id}, mas outro dono. */
    @OneToMany(mappedBy = "produto", cascade = CascadeType.ALL, orphanRemoval = true)
    @SQLRestriction("embalagem_id IS NULL")
    @OrderBy("ordem")
    private List<ProdutoCodigoBarras> codigosBarras = new ArrayList<>();

    /**
     * Fase B5 (V14): fornecedores que vendem o produto. Alterada so pelo
     * {@code FornecedoresDoProduto}, que limpa o da ultima compra antes de
     * apagar a ligacao dele (FK imediata da V14).
     */
    @OneToMany(mappedBy = "produto", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ProdutoFornecedor> fornecedores = new ArrayList<>();

    /** Fase B5 (V14): id interno do fornecedor da ultima compra, sempre um da lista, ou {@code null}. */
    @Column(name = "fornecedor_ultima_compra_id")
    private Long fornecedorUltimaCompraId;

    /** Fase B3 (V12): embalagens na ordem da lista enviada. */
    @OneToMany(mappedBy = "produto", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("ordem")
    private List<ProdutoEmbalagem> embalagens = new ArrayList<>();

    /**
     * Fase E (V10): nome, nome curto, SKU e nome da marca normalizados por
     * {@link TextoDeBusca} — a busca sem acento da listagem. Derivada: so muda
     * por {@link #atualizarDadosBasicos}.
     */
    @Column(name = "busca_normalizada", nullable = false)
    private String buscaNormalizada;

    /** Fase E (V10): so o nome normalizado, para ordenar sem depender de acento nem de collation. */
    @Column(name = "nome_normalizado", nullable = false)
    private String nomeNormalizado;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    @Column(name = "atualizado_em")
    private LocalDateTime atualizadoEm;

    protected Produto() {
        // Construtor exigido pelo JPA.
    }

    /**
     * Cria um produto ja com os dados do cadastro, o {@code numero} de registro
     * reservado pelo {@code Numerador} na mesma transacao e um {@code uuid}
     * novo. O service e responsavel por validar as regras de negocio antes de
     * instanciar. {@code agora} e o momento do cadastro: com custo, a origem
     * dele e {@code EDICAO} (Fase B4).
     */
    public Produto(Empresa empresa, long numero, DadosProduto dados, LocalDateTime agora) {
        this.empresa = empresa;
        this.numero = numero;
        this.uuid = UUID.randomUUID();
        this.ativo = true;
        atualizarDadosBasicos(dados, agora);
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
     * empresa, promocao e atacado) ja terem
     * sido feitas. Promocao ou atacado ausente grava nulo nos campos do bloco.
     *
     * <p>Fase B4: a origem do custo acompanha o custo aqui mesmo, com
     * {@code agora} (ver {@link #acompanharOrigemDoCusto}).
     */
    public void atualizarDadosBasicos(DadosProduto dados, LocalDateTime agora) {
        BigDecimal custoAnterior = this.custo;
        this.nome = dados.nome();
        this.nomeCurto = dados.nomeCurto();
        this.marca = dados.marca();
        this.descricao = dados.descricao();
        this.unidade = dados.unidade();
        this.categoria = dados.categoria();
        this.precoVenda = dados.precoVenda();
        this.custo = dados.custo();
        this.precoMinimo = dados.precoMinimo();
        this.estoqueMinimo = dados.estoqueMinimo();
        this.estoqueMaximo = dados.estoqueMaximo();
        this.pontoReposicao = dados.pontoReposicao();
        this.sku = dados.sku();
        this.precoPromocional = dados.precoPromocional();
        this.promocaoInicio = dados.promocaoInicio();
        this.promocaoFim = dados.promocaoFim();
        this.precoAtacado = dados.precoAtacado();
        this.quantidadeMinimaAtacado = dados.quantidadeMinimaAtacado();
        this.controlaEstoque = dados.controlaEstoque();
        this.codigo = dados.codigo();
        this.vendidoBalanca = dados.vendidoBalanca();
        recalcularTextosDeBusca();
        acompanharOrigemDoCusto(custoAnterior, agora);
    }

    /**
     * Invariante da origem do custo (spec 4; V13): sem custo, sem origem; o
     * custo que mudou pelo cadastro (inclusive vazio -> valor) vira
     * {@code EDICAO} em {@code agora}; o mesmo custo (10 = 10,00) mantem a
     * origem e a data, mesmo a de uma entrada por compra (Review Focus 2).
     */
    private void acompanharOrigemDoCusto(BigDecimal custoAnterior, LocalDateTime agora) {
        if (custo == null) {
            this.custoOrigem = null;
            this.custoOrigemEm = null;
            return;
        }
        if (!HistoricoDePrecos.mesmoValor(custoAnterior, custo)) {
            this.custoOrigem = OrigemDoCusto.EDICAO;
            this.custoOrigemEm = agora;
        }
    }

    /**
     * Colunas da busca (V10) sempre coerentes com o nome, o nome curto, o SKU e
     * o nome da marca (nao o caminho, spec 3.3). Renomear a marca recalcula a
     * busca dos produtos dela em lote, fora daqui ({@code MarcaService}).
     */
    private void recalcularTextosDeBusca() {
        this.nomeNormalizado = TextoDeBusca.normalizar(nome);
        String nomeDaMarca = marca == null ? null : marca.getNome();
        this.buscaNormalizada = TextoDeBusca.textoDoProduto(nome, nomeCurto, sku, nomeDaMarca);
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
        List<String> codigosAnteriores = ListaDeCodigosDeBarras.textos(codigosBarras);
        ListaDeCodigosDeBarras.substituir(codigosBarras, informados,
                (codigo, ordem) -> new ProdutoCodigoBarras(this, codigo.codigo(), codigo.formato(), ordem));
        carimbarSeMudou(codigosAnteriores);
    }

    /**
     * Fase 1 de um salvamento em que um codigo pode mudar de lista (Fase B3,
     * Review Focus 1): tira os codigos da unidade fora de {@code mantidos}, para
     * que sejam apagados no flush antes de outra lista inclui-los.
     */
    void removerCodigosForaDe(Set<String> mantidos) {
        List<String> codigosAnteriores = ListaDeCodigosDeBarras.textos(codigosBarras);
        ListaDeCodigosDeBarras.removerForaDe(codigosBarras, mantidos);
        carimbarSeMudou(codigosAnteriores);
    }

    private void carimbarSeMudou(List<String> codigosAnteriores) {
        if (jaGravado() && !codigosAnteriores.equals(ListaDeCodigosDeBarras.textos(codigosBarras))) {
            this.atualizadoEm = LocalDateTime.now();
        }
    }

    private boolean jaGravado() {
        return id != null;
    }

    /** Codigo de barras da unidade de venda com exatamente este texto, se houver. */
    public Optional<ProdutoCodigoBarras> codigoGravado(String codigo) {
        return ListaDeCodigosDeBarras.comTexto(codigosBarras, codigo);
    }

    // ---------- Embalagens (Fase B3) ----------

    /**
     * Fase 1 do salvamento das embalagens: tira da lista as removidas (apagadas
     * com os codigos no flush, por {@code orphanRemoval}), antes de qualquer
     * inclusao que reuse um codigo delas.
     */
    void removerEmbalagens(Collection<ProdutoEmbalagem> removidas) {
        embalagens.removeAll(removidas);
    }

    /**
     * Fase 2: a lista final na ordem enviada (mantidas e novas). Uma embalagem
     * fora da lista e apagada ({@code orphanRemoval}); as novas sao gravadas
     * em cascata com os seus codigos.
     */
    void substituirEmbalagens(List<ProdutoEmbalagem> finais) {
        embalagens.clear();
        embalagens.addAll(finais);
    }

    /**
     * As embalagens ficam em outra tabela: mudar so elas nao deixaria o
     * produto "sujo". Num produto ja gravado, carimba o {@code atualizadoEm}
     * (o que dispara o UPDATE), como em {@link #substituirCodigos}. Quem decide
     * se algo mudou e o plano do salvamento, calculado antes da aplicacao.
     */
    void registrarAlteracaoDasEmbalagens() {
        if (jaGravado()) {
            this.atualizadoEm = LocalDateTime.now();
        }
    }

    // ---------- Fornecedores (Fase B5) ----------

    /** Ids internos dos fornecedores ligados, na ordem da lista. */
    public Set<Long> idsDosFornecedores() {
        return fornecedores.stream()
                .map(ProdutoFornecedor::getFornecedorId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /**
     * A lista completa de fornecedores (ids ja conferidos na empresa): os
     * ausentes saem ({@code orphanRemoval}) e os novos entram; os mantidos
     * continuam a mesma linha. O fornecedor da ultima compra que sair da lista
     * tem de ter sido limpo antes ({@link #definirFornecedorDaUltimaCompra}
     * com {@code null} e {@code flush}), pela FK imediata da V14.
     */
    void substituirFornecedores(Collection<Long> fornecedorIds) {
        Set<Long> antes = idsDosFornecedores();
        if (fornecedorUltimaCompraId != null && !fornecedorIds.contains(fornecedorUltimaCompraId)) {
            throw new IllegalStateException("Limpe o fornecedor da ultima compra antes de tira-lo da lista.");
        }
        fornecedores.removeIf(ligacao -> !fornecedorIds.contains(ligacao.getFornecedorId()));
        for (Long fornecedorId : fornecedorIds) {
            if (!idsDosFornecedores().contains(fornecedorId)) {
                fornecedores.add(new ProdutoFornecedor(this, fornecedorId));
            }
        }
        carimbarSeOsFornecedoresMudaram(antes);
    }

    /** Liga o fornecedor se ainda nao estiver na lista; {@code true} se ligou agora. */
    boolean ligarFornecedor(Long fornecedorId) {
        if (idsDosFornecedores().contains(fornecedorId)) {
            return false;
        }
        Set<Long> antes = idsDosFornecedores();
        fornecedores.add(new ProdutoFornecedor(this, fornecedorId));
        carimbarSeOsFornecedoresMudaram(antes);
        return true;
    }

    /** Tira o fornecedor da lista; o da ultima compra precisa ter sido limpo antes (FK da V14). */
    void desligarFornecedor(Long fornecedorId) {
        if (Objects.equals(fornecedorUltimaCompraId, fornecedorId)) {
            throw new IllegalStateException("Limpe o fornecedor da ultima compra antes de tira-lo da lista.");
        }
        Set<Long> antes = idsDosFornecedores();
        fornecedores.removeIf(ligacao -> ligacao.getFornecedorId().equals(fornecedorId));
        carimbarSeOsFornecedoresMudaram(antes);
    }

    /** O fornecedor da ultima compra: um da lista, ou {@code null} (nenhum). */
    void definirFornecedorDaUltimaCompra(Long fornecedorId) {
        if (fornecedorId != null && !idsDosFornecedores().contains(fornecedorId)) {
            throw new IllegalArgumentException("O fornecedor da ultima compra precisa estar na lista.");
        }
        this.fornecedorUltimaCompraId = fornecedorId;
    }

    /** As ligacoes ficam em outra tabela: num produto ja gravado, carimba o {@code atualizadoEm} se mudaram. */
    private void carimbarSeOsFornecedoresMudaram(Set<Long> antes) {
        if (jaGravado() && !antes.equals(idsDosFornecedores())) {
            this.atualizadoEm = LocalDateTime.now();
        }
    }

    // ---------- Origem do custo (Fase B4) ----------

    /**
     * Custo vindo de uma entrada por compra (docs/modules/produtos-custo-entrada.md,
     * 2.2): o custo do produto ja arredondado a centavos pelo
     * {@link CustoDeEntrada}, a origem {@code ENTRADA_COMPRA} e a data do
     * movimento, mesmo que o valor nao mude.
     */
    void registrarCustoDeEntrada(BigDecimal custoDoProduto, LocalDateTime em) {
        this.custo = custoDoProduto;
        this.custoOrigem = OrigemDoCusto.ENTRADA_COMPRA;
        this.custoOrigemEm = em;
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

    /** Numero de registro do produto na empresa (1, 2, 3...), imutavel. */
    public Long getNumero() {
        return numero;
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

    /** Marca (qualquer nivel da arvore), ou {@code null}. */
    public Marca getMarca() {
        return marca;
    }

    /** Fornecedores ligados ao produto (somente leitura; alterados pelo {@code FornecedoresDoProduto}). */
    public List<ProdutoFornecedor> getFornecedores() {
        return Collections.unmodifiableList(fornecedores);
    }

    /** Id interno do fornecedor da ultima compra (um da lista), ou {@code null}. */
    public Long getFornecedorUltimaCompraId() {
        return fornecedorUltimaCompraId;
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

    /** Origem do custo atual, ou {@code null} (sem custo ou origem desconhecida). */
    public OrigemDoCusto getCustoOrigem() {
        return custoOrigem;
    }

    /** Quando a origem do custo foi registrada, ou {@code null} junto com a origem. */
    public LocalDateTime getCustoOrigemEm() {
        return custoOrigemEm;
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

    /** Embalagens na ordem (somente leitura; alteradas pelo {@code EmbalagensDoProduto}). */
    public List<ProdutoEmbalagem> getEmbalagens() {
        return Collections.unmodifiableList(embalagens);
    }

    /** Embalagem deste produto com o UUID publico, se houver. */
    public Optional<ProdutoEmbalagem> embalagem(UUID embalagemId) {
        return embalagens.stream()
                .filter(embalagem -> embalagem.getUuid().equals(embalagemId))
                .findFirst();
    }

    public String getSku() {
        return sku;
    }

    /** Codigo do produto (1 a 999999), ou {@code null}. */
    public Integer getCodigo() {
        return codigo;
    }

    /** Se o produto e vendido na balanca (entao sempre tem {@link #getCodigo()}). */
    public boolean isVendidoBalanca() {
        return vendidoBalanca;
    }

    /** Preco promocional, ou {@code null} sem promocao (V8: os tres campos da promocao vem juntos). */
    public BigDecimal getPrecoPromocional() {
        return precoPromocional;
    }

    /** Primeiro dia da promocao (inclusivo), ou {@code null} sem promocao. */
    public LocalDate getPromocaoInicio() {
        return promocaoInicio;
    }

    /** Ultimo dia da promocao (inclusivo), ou {@code null} sem promocao. */
    public LocalDate getPromocaoFim() {
        return promocaoFim;
    }

    /** Preco de atacado, ou {@code null} sem atacado (V8: vem junto com a quantidade minima). */
    public BigDecimal getPrecoAtacado() {
        return precoAtacado;
    }

    /** Quantidade a partir da qual o atacado vale (maior que 1), ou {@code null} sem atacado. */
    public BigDecimal getQuantidadeMinimaAtacado() {
        return quantidadeMinimaAtacado;
    }

    public boolean isAtivo() {
        return ativo;
    }

    /**
     * Se o produto controla estoque (spec 4.1 da Fase D). Desligado, o saldo e o
     * historico ficam guardados, mas nao se aceitam ajustes.
     */
    public boolean isControlaEstoque() {
        return controlaEstoque;
    }

    /** Texto pesquisavel normalizado (V10); uso interno da busca, nao sai na API. */
    public String getBuscaNormalizada() {
        return buscaNormalizada;
    }

    /** Nome normalizado (V10); uso interno da ordenacao, nao sai na API. */
    public String getNomeNormalizado() {
        return nomeNormalizado;
    }

    public LocalDateTime getCriadoEm() {
        return criadoEm;
    }

    public LocalDateTime getAtualizadoEm() {
        return atualizadoEm;
    }
}
