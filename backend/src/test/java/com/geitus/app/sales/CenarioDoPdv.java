package com.geitus.app.sales;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.boot.test.context.TestComponent;
import org.springframework.jdbc.core.JdbcTemplate;

import com.geitus.app.cashier.CenarioDeCaixa;
import com.geitus.app.cashier.CenarioDeCaixa.EmpresaDeCaixa;
import com.geitus.app.catalog.ProdutoService;
import com.geitus.app.catalog.categoria.CategoriaService;
import com.geitus.app.catalog.categoria.dto.CategoriaRequest;
import com.geitus.app.catalog.dto.AtacadoRequest;
import com.geitus.app.catalog.dto.EmbalagemRequest;
import com.geitus.app.catalog.dto.ProdutoRequest;
import com.geitus.app.catalog.dto.ProdutoResponse;
import com.geitus.app.catalog.dto.PromocaoRequest;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;
import com.geitus.app.company.EmpresaRepository;

/**
 * Dados dos testes de integracao do PDV: empresas do {@link CenarioDeCaixa}
 * (ADMIN e OPERADORA) com as unidades padrao e o "Caixa 1", produtos
 * cadastrados pelo {@link ProdutoService} real e atalhos JDBC para vendas e
 * itens (os testes do estoque da venda, que nao passam pela finalizacao).
 * Importado explicitamente ({@code @Import}).
 */
@TestComponent
public class CenarioDoPdv {

    private static final AtomicLong SEQUENCIA = new AtomicLong();

    private final CenarioDeCaixa cenarioDeCaixa;
    private final EmpresaRepository empresaRepository;
    private final UnidadeMedidaService unidadeService;
    private final ProdutoService produtoService;
    private final CategoriaService categoriaService;
    private final JdbcTemplate jdbcTemplate;
    private final Clock relogio;

    CenarioDoPdv(CenarioDeCaixa cenarioDeCaixa, EmpresaRepository empresaRepository,
            UnidadeMedidaService unidadeService, ProdutoService produtoService, CategoriaService categoriaService,
            JdbcTemplate jdbcTemplate, Clock relogio) {
        this.cenarioDeCaixa = cenarioDeCaixa;
        this.empresaRepository = empresaRepository;
        this.unidadeService = unidadeService;
        this.produtoService = produtoService;
        this.categoriaService = categoriaService;
        this.jdbcTemplate = jdbcTemplate;
        this.relogio = relogio;
    }

    /** Empresa com ADMIN, OPERADORA, unidades padrao e o ponto "Caixa 1". */
    public record EmpresaDoPdv(EmpresaDeCaixa caixa, UUID ponto) {

        public Long id() {
            return caixa.id();
        }

        public Long admin() {
            return caixa.admin();
        }

        public Long operadora() {
            return caixa.operadora();
        }
    }

    public EmpresaDoPdv novaEmpresa() {
        EmpresaDeCaixa caixa = cenarioDeCaixa.novaEmpresa();
        unidadeService.criarPadroes(empresaRepository.findById(caixa.id()).orElseThrow());
        return new EmpresaDoPdv(caixa, cenarioDeCaixa.novoPonto(caixa, "Caixa 1"));
    }

    /** UUID publico da unidade da empresa com a sigla. */
    public UUID unidade(EmpresaDoPdv empresa, String sigla) {
        return unidadeService.listarParaUsuario(empresa.admin(), null).stream()
                .filter(unidade -> unidade.sigla().equals(sigla))
                .map(UnidadeMedidaResponse::id)
                .findFirst()
                .orElseThrow();
    }

    /**
     * O que um produto de teste precisa; o que nao for informado fica de fora
     * (sem custo, sem codigo, sem embalagem, controlando estoque, sem estoque).
     */
    public record NovoProduto(String nome, String sigla, String preco, String custo, String precoMinimo,
            Integer codigo, List<String> codigosBarras, List<NovaEmbalagem> embalagens, boolean controlaEstoque,
            String estoqueInicial, String precoPromocional, AtacadoRequest atacado, boolean vendidoBalanca) {

        public static NovoProduto de(String nome, String sigla, String preco) {
            return new NovoProduto(nome, sigla, preco, null, null, null, List.of(), List.of(), true, null, null, null, false);
        }

        public NovoProduto comCusto(String valor) {
            return new NovoProduto(nome, sigla, preco, valor, precoMinimo, codigo, codigosBarras, embalagens,
                    controlaEstoque, estoqueInicial, precoPromocional, atacado, vendidoBalanca);
        }

        public NovoProduto comPrecoMinimo(String valor) {
            return new NovoProduto(nome, sigla, preco, custo, valor, codigo, codigosBarras, embalagens,
                    controlaEstoque, estoqueInicial, precoPromocional, atacado, vendidoBalanca);
        }

        public NovoProduto comCodigo(int valor) {
            return new NovoProduto(nome, sigla, preco, custo, precoMinimo, valor, codigosBarras, embalagens,
                    controlaEstoque, estoqueInicial, precoPromocional, atacado, vendidoBalanca);
        }

        public NovoProduto comCodigosBarras(String... codigos) {
            return new NovoProduto(nome, sigla, preco, custo, precoMinimo, codigo, List.of(codigos), embalagens,
                    controlaEstoque, estoqueInicial, precoPromocional, atacado, vendidoBalanca);
        }

        public NovoProduto comEmbalagens(NovaEmbalagem... novas) {
            return new NovoProduto(nome, sigla, preco, custo, precoMinimo, codigo, codigosBarras, List.of(novas),
                    controlaEstoque, estoqueInicial, precoPromocional, atacado, vendidoBalanca);
        }

        public NovoProduto semControleDeEstoque() {
            return new NovoProduto(nome, sigla, preco, custo, precoMinimo, codigo, codigosBarras, embalagens, false,
                    null, precoPromocional, atacado, vendidoBalanca);
        }

        public NovoProduto comEstoque(String quantidade) {
            return new NovoProduto(nome, sigla, preco, custo, precoMinimo, codigo, codigosBarras, embalagens,
                    controlaEstoque, quantidade, precoPromocional, atacado, vendidoBalanca);
        }

        public NovoProduto emPromocao(String valor) {
            return new NovoProduto(nome, sigla, preco, custo, precoMinimo, codigo, codigosBarras, embalagens,
                    controlaEstoque, estoqueInicial, valor, atacado, vendidoBalanca);
        }

        /** Vendido na balanca (exige o codigo do produto): so ele aceita etiqueta no PDV. */
        public NovoProduto naBalanca(int codigoDoProduto) {
            return new NovoProduto(nome, sigla, preco, custo, precoMinimo, codigoDoProduto, codigosBarras, embalagens,
                    controlaEstoque, estoqueInicial, precoPromocional, atacado, true);
        }

        public NovoProduto comAtacado(String valor, String quantidadeMinima) {
            return new NovoProduto(nome, sigla, preco, custo, precoMinimo, codigo, codigosBarras, embalagens,
                    controlaEstoque, estoqueInicial, precoPromocional,
                    new AtacadoRequest(new BigDecimal(valor), new BigDecimal(quantidadeMinima)), vendidoBalanca);
        }
    }

    /** Embalagem de venda: sigla, quantidade de unidades, preco proprio (ou {@code null}) e codigos. */
    public record NovaEmbalagem(String sigla, String quantidade, String preco, List<String> codigosBarras) {
    }

    /** Cadastra o produto (nome unico na empresa e preciso; o numero do cenario ajuda). */
    public ProdutoResponse produto(EmpresaDoPdv empresa, NovoProduto novo) {
        return produtoService.cadastrarParaUsuario(empresa.admin(), request(empresa, novo));
    }

    /** PATCH do cadastro com os dados informados (por exemplo, sem as embalagens). */
    public ProdutoResponse atualizarProduto(EmpresaDoPdv empresa, UUID produto, NovoProduto novo) {
        return produtoService.atualizarDadosBasicosParaUsuario(empresa.admin(), produto, request(empresa, novo));
    }

    /** Categoria cadastrada pelo servico real; {@code pai} nulo = categoria principal. */
    public UUID categoria(EmpresaDoPdv empresa, String nome, UUID pai) {
        return categoriaService.cadastrarParaUsuario(empresa.admin(), new CategoriaRequest(nome, pai)).id();
    }

    /** Liga o produto a categoria direto no banco (o cadastro do produto do cenario nao tem categoria). */
    public void categorizar(UUID produto, UUID categoria) {
        jdbcTemplate.update("UPDATE produtos SET categoria_id = (SELECT id FROM categorias WHERE uuid = ?) "
                + "WHERE uuid = ?", categoria, produto);
    }

    public void inativarProduto(EmpresaDoPdv empresa, UUID produto) {
        produtoService.inativarParaUsuario(empresa.admin(), produto);
    }

    /** Troca o preco de venda direto no banco (o "preco mudou entre o calculo e a finalizacao"). */
    public void trocarPreco(UUID produto, String preco) {
        jdbcTemplate.update("UPDATE produtos SET preco_venda = ?::numeric WHERE uuid = ?", preco, produto);
    }

    /** Cliente gravado direto no banco; devolve o UUID publico. */
    public UUID cliente(EmpresaDoPdv empresa, String nome, boolean ativo) {
        UUID uuid = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO clientes (uuid, empresa_id, numero, nome, ativo) VALUES (?, ?, ?, ?, ?)",
                uuid, empresa.id(), SEQUENCIA.incrementAndGet() + 100000, nome, ativo);
        return uuid;
    }

    private ProdutoRequest request(EmpresaDoPdv empresa, NovoProduto novo) {
        List<EmbalagemRequest> embalagens = novo.embalagens().stream()
                .map(embalagem -> new EmbalagemRequest(null, unidade(empresa, embalagem.sigla()),
                        new BigDecimal(embalagem.quantidade()), valorOuNulo(embalagem.preco()), false,
                        embalagem.codigosBarras()))
                .toList();
        PromocaoRequest promocao = novo.precoPromocional() == null
                ? null
                : new PromocaoRequest(new BigDecimal(novo.precoPromocional()), hoje(), hoje().plusDays(10));
        ProdutoRequest request = new ProdutoRequest(novo.nome(), null, null, unidade(empresa, novo.sigla()), null,
                null, null, null, new BigDecimal(novo.preco()), valorOuNulo(novo.custo()), null, null, null,
                valorOuNulo(novo.precoMinimo()), novo.codigosBarras(), embalagens, null, novo.codigo(),
                novo.vendidoBalanca(), promocao, novo.atacado(), novo.controlaEstoque(),
                valorOuNulo(novo.estoqueInicial()));
        return request;
    }

    public LocalDate hoje() {
        return LocalDate.now(relogio);
    }

    /** Id interno do produto pelo UUID publico. */
    public Long idDoProduto(UUID produto) {
        return jdbcTemplate.queryForObject("SELECT id FROM produtos WHERE uuid = ?", Long.class, produto);
    }

    public Long idDaSessao(UUID sessao) {
        return jdbcTemplate.queryForObject("SELECT id FROM sessoes_caixa WHERE uuid = ?", Long.class, sessao);
    }

    /** Saldo gravado do produto; 0 sem linha de saldo. */
    public BigDecimal saldo(UUID produto) {
        List<BigDecimal> saldos = jdbcTemplate.queryForList("""
                SELECT s.saldo FROM estoque_saldos s JOIN produtos p ON p.id = s.produto_id WHERE p.uuid = ?
                """, BigDecimal.class, produto);
        return saldos.isEmpty() ? BigDecimal.ZERO : saldos.get(0);
    }

    /**
     * Venda CONCLUIDA gravada direto no banco, na sessao aberta pelo vendedor,
     * com um item de unidade do produto (preco 1,00) e o pagamento em dinheiro,
     * num comando so: a venda fica coerente no commit (tg_venda_coerente, V17).
     * Devolve o id do item.
     */
    public long itemVendidoPorJdbc(EmpresaDoPdv empresa, UUID sessao, Long vendedor, UUID produto,
            String quantidade) {
        return itemVendidoPorJdbc(empresa, sessao, vendedor, produto, quantidade, 0);
    }

    /** Como o de cima, com a venda concluida {@code diasAtras} dias antes de agora (o ranking do catalogo). */
    public long itemVendidoPorJdbc(EmpresaDoPdv empresa, UUID sessao, Long vendedor, UUID produto,
            String quantidade, int diasAtras) {
        return jdbcTemplate.queryForObject("""
                WITH v AS (
                    INSERT INTO vendas (uuid, empresa_id, numero, sessao_caixa_id, usuario_id, status, subtotal,
                                        desconto_itens, desconto_total, total, troco, chave_idempotencia, concluida_em)
                    VALUES (gen_random_uuid(), ?, ?, ?, ?, 'CONCLUIDA', ?::numeric, 0, 0, ?::numeric, 0,
                            gen_random_uuid(), now() - make_interval(days => ?))
                    RETURNING id, empresa_id, total),
                i AS (
                    INSERT INTO itens_venda (empresa_id, venda_id, ordem, produto_id, produto_nome, unidade_sigla,
                                             etiqueta, quantidade, quantidade_estoque, preco_unitario, origem_preco,
                                             valor_bruto, desconto_item, desconto_rateado, valor_liquido)
                    SELECT v.empresa_id, v.id, 1, (SELECT id FROM produtos WHERE uuid = ?), 'Produto', 'UN', false,
                           ?::numeric, ?::numeric, 1.00, 'NORMAL', v.total, 0, 0, v.total
                      FROM v
                    RETURNING id),
                p AS (
                    INSERT INTO pagamentos_venda (empresa_id, venda_id, forma, valor)
                    SELECT v.empresa_id, v.id, 'DINHEIRO', v.total FROM v)
                SELECT id FROM i
                """, Long.class, empresa.id(), SEQUENCIA.incrementAndGet() + 100000, idDaSessao(sessao), vendedor,
                quantidade, quantidade, diasAtras, produto, quantidade, quantidade);
    }

    private static BigDecimal valorOuNulo(String valor) {
        return valor == null ? null : new BigDecimal(valor);
    }
}
