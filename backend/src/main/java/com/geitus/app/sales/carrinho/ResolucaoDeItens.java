package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.DonoDoCodigoDeBarras;
import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoEmbalagem;
import com.geitus.app.catalog.ProdutoRepository;
import com.geitus.app.catalog.SituacaoPromocao;
import com.geitus.app.catalog.balanca.EtiquetaBalancaService;
import com.geitus.app.catalog.listagem.ConsultaDeProdutos;
import com.geitus.app.catalog.listagem.FiltroDeProdutos;
import com.geitus.app.catalog.listagem.OrdemDeProdutos;
import com.geitus.app.catalog.listagem.StatusFiltro;
import com.geitus.app.iam.ResolvedorDoUsuarioAutenticado;
import com.geitus.app.iam.UsuarioAutenticado;
import com.geitus.app.sales.DadosDaVendaInvalidosException;
import com.geitus.app.sales.VendaConflitoException;
import com.geitus.app.sales.VendaNaoEncontradaException;
import com.geitus.app.sales.carrinho.CodigoInterpretado.CodigoComQuantidade;
import com.geitus.app.sales.carrinho.CodigoInterpretado.Etiqueta;
import com.geitus.app.sales.configuracao.ConfiguracaoDoPdvService;
import com.geitus.app.sales.dto.ItemResolvidoResponse;
import com.geitus.app.sales.dto.ItemResolvidoResponse.TipoDeLinha;
import com.geitus.app.sales.dto.ProdutoDoPdvResponse;
import com.geitus.app.shared.busca.TextoDeBusca;
import com.geitus.app.shared.formato.FormatoBrasileiro;

/**
 * Resolve o que o operador leu ou buscou (docs/modules/pdv.md, 3.1 e 5.3):
 * {@code GET /api/pdv/itens?codigo=} devolve o item para o carrinho (unidade,
 * embalagem ou etiqueta) e {@code ?busca=} ate 20 produtos ativos. Sempre na
 * empresa do usuario (DEC-016); nunca o custo.
 *
 * <p>Recusas, sem alterar o carrinho: codigo nao encontrado (404), produto
 * inativo (409), quantidade invalida (400) e, com "Vender sem estoque"
 * desligada, saldo menor que a quantidade lida (409). A soma das linhas do
 * carrinho contra o saldo e do calculo.
 */
@Service
public class ResolucaoDeItens {

    static final String MENSAGEM_CODIGO_NAO_ENCONTRADO = "Código não encontrado.";
    static final String MENSAGEM_ESTOQUE_INSUFICIENTE = "Estoque insuficiente para %s (saldo %s %s).";
    static final int LIMITE_DA_BUSCA = 20;

    private static final Pattern CODIGO_DO_PRODUTO = Pattern.compile("[0-9]{1,6}");
    private static final int MAIOR_CODIGO_DO_PRODUTO = 999_999;

    private final ResolvedorDoUsuarioAutenticado resolvedor;
    private final ProdutoRepository produtoRepository;
    private final ConsultaDeProdutos consultaDeProdutos;
    private final EtiquetaBalancaService etiquetaService;
    private final ConfiguracaoDoPdvService configuracaoService;
    private final ProdutosDoPdv produtosDoPdv;
    private final Clock relogio;

    public ResolucaoDeItens(ResolvedorDoUsuarioAutenticado resolvedor, ProdutoRepository produtoRepository,
            ConsultaDeProdutos consultaDeProdutos, EtiquetaBalancaService etiquetaService,
            ConfiguracaoDoPdvService configuracaoService, ProdutosDoPdv produtosDoPdv, Clock relogio) {
        this.resolvedor = resolvedor;
        this.produtoRepository = produtoRepository;
        this.consultaDeProdutos = consultaDeProdutos;
        this.etiquetaService = etiquetaService;
        this.configuracaoService = configuracaoService;
        this.produtosDoPdv = produtosDoPdv;
        this.relogio = relogio;
    }

    @Transactional(readOnly = true)
    public ItemResolvidoResponse resolverParaUsuario(Long idUsuario, String codigo) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario);
        Long empresaId = usuario.empresaId();
        CodigoInterpretado interpretado = InterpretadorDeCodigo.interpretar(codigo,
                etiquetaService.configuracaoDaEmpresa(empresaId));
        return switch (interpretado) {
            case Etiqueta etiqueta -> daEtiqueta(empresaId, etiqueta);
            case CodigoComQuantidade comQuantidade -> doCodigo(empresaId, comQuantidade);
            case CodigoInterpretado.Busca busca -> throw naoEncontrado();
        };
    }

    /** Ate 20 produtos ativos da empresa, por nome (a mesma busca da listagem de produtos), em ordem de nome. */
    @Transactional(readOnly = true)
    public List<ProdutoDoPdvResponse> buscarParaUsuario(Long idUsuario, String busca) {
        Long empresaId = resolvedor.resolver(idUsuario).empresaId();
        List<String> palavras = TextoDeBusca.palavras(busca);
        String termoDeCodigo = TextoDeBusca.termoDeCodigo(busca);
        if (palavras.isEmpty() && termoDeCodigo == null) {
            return List.of();
        }
        FiltroDeProdutos filtro = new FiltroDeProdutos(empresaId, palavras, termoDeCodigo,
                TextoDeBusca.termoNumerico(busca), StatusFiltro.ATIVOS, null, null, false,
                SituacaoPromocao.hoje(relogio));
        List<Long> ids = consultaDeProdutos.buscar(filtro, OrdemDeProdutos.NOME, 0, LIMITE_DA_BUSCA).ids();
        return produtosDoPdv.respostas(empresaId, naOrdem(ids, produtosPorIds(empresaId, ids)));
    }

    // ---------- Etiqueta ----------

    private ItemResolvidoResponse daEtiqueta(Long empresaId, Etiqueta etiqueta) {
        Produto produto = produtoRepository.findByEmpresa_IdAndCodigo(empresaId, etiqueta.leitura().codigoProduto())
                .filter(Produto::isVendidoBalanca)
                .orElseThrow(ResolucaoDeItens::naoEncontrado);
        exigirAtivo(produto);
        LinhaParaCalculo linha = new LinhaParaCalculo(1, produto, null, etiqueta.leitura(), etiqueta.codigoLido(),
                null, null);
        CalculoDaVenda calculo = CalculadoraDaVenda.calcular(List.of(linha), null, List.of(), true,
                BigDecimal.ZERO, SituacaoPromocao.hoje(relogio));
        calculo.erros().stream().findFirst().ifPresent(erro -> {
            throw new DadosDaVendaInvalidosException(erro.mensagem(), InterpretadorDeCodigo.CAMPO);
        });
        BigDecimal quantidade = calculo.linhas().get(0).quantidade();
        return resposta(empresaId, produto, null, TipoDeLinha.ETIQUETA, quantidade, etiqueta.codigoLido());
    }

    // ---------- Codigo do produto ou codigo de barras ----------

    /**
     * Nesta ordem: o codigo do produto (ate 6 digitos, zeros a esquerda
     * aceitos), um codigo de barras do produto (a unidade) ou de uma embalagem.
     */
    private ItemResolvidoResponse doCodigo(Long empresaId, CodigoComQuantidade lido) {
        Optional<Produto> peloCodigo = codigoDoProduto(lido.codigo())
                .flatMap(codigo -> produtoRepository.findByEmpresa_IdAndCodigo(empresaId, codigo));
        if (peloCodigo.isPresent()) {
            return daLinha(empresaId, peloCodigo.get(), null, lido);
        }
        DonoDoCodigoDeBarras dono = produtoRepository.donoDoCodigoDeBarras(empresaId, lido.codigo())
                .orElseThrow(ResolucaoDeItens::naoEncontrado);
        Produto produto = produtosPorIds(empresaId, List.of(dono.produtoId())).get(dono.produtoId());
        ProdutoEmbalagem embalagem = dono.embalagemId() == null
                ? null
                : produto.getEmbalagens().stream()
                        .filter(candidata -> candidata.getId().equals(dono.embalagemId()))
                        .findFirst()
                        .orElseThrow(ResolucaoDeItens::naoEncontrado);
        return daLinha(empresaId, produto, embalagem, lido);
    }

    private ItemResolvidoResponse daLinha(Long empresaId, Produto produto, ProdutoEmbalagem embalagem,
            CodigoComQuantidade lido) {
        exigirAtivo(produto);
        boolean daEmbalagem = embalagem != null;
        String sigla = daEmbalagem ? embalagem.getUnidade().getSigla() : produto.getUnidade().getSigla();
        boolean aceitaFracao = !daEmbalagem && produto.getUnidade().isFracionada();
        QuantidadeDaLinha.recusa(lido.quantidade(), aceitaFracao, sigla).ifPresent(mensagem -> {
            throw new DadosDaVendaInvalidosException(mensagem, InterpretadorDeCodigo.CAMPO);
        });
        BigDecimal quantidadeEstoque = daEmbalagem
                ? lido.quantidade().multiply(embalagem.getQuantidade())
                : lido.quantidade();
        exigirEstoqueSeConfigurado(empresaId, produto, quantidadeEstoque);
        return resposta(empresaId, produto, embalagem, daEmbalagem ? TipoDeLinha.EMBALAGEM : TipoDeLinha.UNIDADE,
                lido.quantidade(), lido.codigoLido());
    }

    // ---------- Apoio ----------

    private void exigirEstoqueSeConfigurado(Long empresaId, Produto produto, BigDecimal quantidadeEstoque) {
        if (!produto.isControlaEstoque() || configuracaoService.daEmpresa(empresaId).venderSemEstoque()) {
            return;
        }
        BigDecimal saldo = produtosDoPdv.saldos(empresaId, List.of(produto.getId())).get(produto.getId());
        if (saldo.compareTo(quantidadeEstoque) < 0) {
            throw new VendaConflitoException(MENSAGEM_ESTOQUE_INSUFICIENTE.formatted(produto.getNome(),
                    FormatoBrasileiro.numero(saldo), produto.getUnidade().getSigla()), InterpretadorDeCodigo.CAMPO);
        }
    }

    private ItemResolvidoResponse resposta(Long empresaId, Produto produto, ProdutoEmbalagem embalagem,
            TipoDeLinha tipo, BigDecimal quantidade, String codigoLido) {
        ProdutoDoPdvResponse resposta = produtosDoPdv.respostas(empresaId, List.of(produto)).get(0);
        return new ItemResolvidoResponse(tipo, quantidade, resposta, embalagem == null ? null : embalagem.getUuid(),
                codigoLido);
    }

    private static void exigirAtivo(Produto produto) {
        if (!produto.isAtivo()) {
            throw new VendaConflitoException(MontagemDoCarrinho.MENSAGEM_PRODUTO_INATIVO, InterpretadorDeCodigo.CAMPO);
        }
    }

    /** O texto como codigo do produto (1 a 999999, sem zeros a esquerda), se couber. */
    private static Optional<Integer> codigoDoProduto(String codigo) {
        if (!CODIGO_DO_PRODUTO.matcher(codigo).matches()) {
            return Optional.empty();
        }
        int numero = Integer.parseInt(codigo);
        return numero > 0 && numero <= MAIOR_CODIGO_DO_PRODUTO ? Optional.of(numero) : Optional.empty();
    }

    private Map<Long, Produto> produtosPorIds(Long empresaId, List<Long> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return produtoRepository.buscarParaVendaPorIds(empresaId, ids).stream()
                .collect(Collectors.toMap(Produto::getId, Function.identity(), (primeiro, repetido) -> primeiro));
    }

    private static List<Produto> naOrdem(List<Long> ids, Map<Long, Produto> produtos) {
        return ids.stream().map(produtos::get).filter(Objects::nonNull).toList();
    }

    private static VendaNaoEncontradaException naoEncontrado() {
        return new VendaNaoEncontradaException(MENSAGEM_CODIGO_NAO_ENCONTRADO, InterpretadorDeCodigo.CAMPO);
    }
}
