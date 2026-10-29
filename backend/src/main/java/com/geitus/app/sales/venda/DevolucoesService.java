package com.geitus.app.sales.venda;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.cashier.HorarioDoCaixa;
import com.geitus.app.cashier.RecebimentosDoCaixa;
import com.geitus.app.cashier.RecebimentosDoCaixa.Reembolso;
import com.geitus.app.cashier.RecebimentosDoCaixa.SessaoAbertaParaVenda;
import com.geitus.app.cashier.ViolacaoDeConstraint;
import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoRepository;
import com.geitus.app.iam.ResolvedorDoUsuarioAutenticado;
import com.geitus.app.iam.UsuarioAutenticado;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.inventory.EstoqueDaVenda;
import com.geitus.app.inventory.EstoqueDaVenda.DevolucaoDeItem;
import com.geitus.app.sales.DadosDaVendaInvalidosException;
import com.geitus.app.sales.VendaConflitoException;
import com.geitus.app.sales.VendaNaoEncontradaException;
import com.geitus.app.sales.dto.LimitesDoCarrinho;
import com.geitus.app.sales.venda.CalculadoraDaDevolucao.LinhaDevolvida;
import com.geitus.app.sales.venda.CalculadoraDaDevolucao.LinhaVendida;
import com.geitus.app.sales.venda.dto.DevolucaoRequest;
import com.geitus.app.sales.venda.dto.DevolucaoRequest.ItemDevolvido;
import com.geitus.app.sales.venda.dto.DevolucaoRequest.ReembolsoInformado;
import com.geitus.app.sales.venda.dto.DevolucaoResponse;
import com.geitus.app.sales.venda.dto.VendaParaDevolucaoResponse;
import com.geitus.app.sales.venda.dto.VendaParaDevolucaoResponse.FormaParaReembolso;
import com.geitus.app.sales.venda.dto.VendaParaDevolucaoResponse.LinhaParaDevolucao;
import com.geitus.app.shared.formato.FormatoBrasileiro;

/**
 * Devolucao de itens de uma venda (docs/modules/estoque.md, secao 6.2): so o
 * ADMIN (perfil do banco), de qualquer venda concluida da empresa, com o
 * proprio caixa aberto (o reembolso sai dele).
 *
 * <p>Ordem das travas (DT-032, cabecalho da V19): a sessao de quem devolve, a
 * venda ({@code FOR UPDATE}: serializa as devolucoes da mesma venda e o
 * cancelamento) e os produtos em ordem de id; os itens da venda sao travados
 * pelo gatilho ao gravar os itens da devolucao. A V19 confere tudo de novo
 * ({@link VendaRepository#conferirConstraintsAgora}).
 *
 * <p>A idempotencia e a da {@code chave} (como na venda): o mesmo pedido
 * devolve a devolucao gravada (200); a chave com outros dados, 409.
 */
@Service
public class DevolucoesService {

    static final String CAMPO_ITENS = "itens";
    static final String CAMPO_REEMBOLSOS = "reembolsos";

    static final String MENSAGEM_VENDA_CANCELADA = "Esta venda foi cancelada e não pode ser devolvida.";
    static final String MENSAGEM_SEM_ITENS = "Escolha ao menos um item para devolver.";
    static final String MENSAGEM_LINHA_INEXISTENTE = "Esta linha não existe na venda.";
    static final String MENSAGEM_LINHA_REPETIDA = "Cada linha da venda entra uma vez só.";
    static final String MENSAGEM_FORMA_NAO_RECEBIDA = "Esta venda não recebeu em %s.";
    static final String MENSAGEM_REEMBOLSO_POSITIVO = "Informe um valor maior que zero.";
    static final String MENSAGEM_REEMBOLSO_ALEM = "Em %s restam %s para devolver.";
    static final String MENSAGEM_DISTRIBUA = "Distribua %s entre as formas de pagamento.";
    static final String MENSAGEM_SEM_VALOR = "Esta devolução não tem valor a reembolsar.";

    private static final String CONSTRAINT_DA_CHAVE = "uq_devolucao_chave";

    /** "em dinheiro", "no débito"... nas mensagens. */
    private static final Map<FormaDePagamento, String> NOME_DA_FORMA = new EnumMap<>(Map.of(
            FormaDePagamento.DINHEIRO, "dinheiro",
            FormaDePagamento.DEBITO, "débito",
            FormaDePagamento.CREDITO, "crédito",
            FormaDePagamento.PIX, "PIX"));

    private final ResolvedorDoUsuarioAutenticado resolvedor;
    private final RecebimentosDoCaixa recebimentos;
    private final EstoqueDaVenda estoqueDaVenda;
    private final VendaRepository vendaRepository;
    private final ItemDaVendaRepository itemRepository;
    private final PagamentoDaVendaRepository pagamentoRepository;
    private final DevolucaoRepository devolucaoRepository;
    private final ItemDaDevolucaoRepository itemDevolucaoRepository;
    private final ProdutoRepository produtoRepository;
    private final UsuarioRepository usuarioRepository;
    private final RespostasDaDevolucao respostas;
    private final Clock relogio;
    private final TransactionTemplate transacao;

    @SuppressWarnings("java:S107") // As colaboracoes da devolucao atomica: caixa, estoque, venda e gravacao.
    public DevolucoesService(ResolvedorDoUsuarioAutenticado resolvedor, RecebimentosDoCaixa recebimentos,
            EstoqueDaVenda estoqueDaVenda, VendaRepository vendaRepository, ItemDaVendaRepository itemRepository,
            PagamentoDaVendaRepository pagamentoRepository, DevolucaoRepository devolucaoRepository,
            ItemDaDevolucaoRepository itemDevolucaoRepository, ProdutoRepository produtoRepository,
            UsuarioRepository usuarioRepository, RespostasDaDevolucao respostas, Clock relogio,
            PlatformTransactionManager gerenciadorDeTransacoes) {
        this.resolvedor = resolvedor;
        this.recebimentos = recebimentos;
        this.estoqueDaVenda = estoqueDaVenda;
        this.vendaRepository = vendaRepository;
        this.itemRepository = itemRepository;
        this.pagamentoRepository = pagamentoRepository;
        this.devolucaoRepository = devolucaoRepository;
        this.itemDevolucaoRepository = itemDevolucaoRepository;
        this.produtoRepository = produtoRepository;
        this.usuarioRepository = usuarioRepository;
        this.respostas = respostas;
        this.relogio = relogio;
        this.transacao = new TransactionTemplate(gerenciadorDeTransacoes);
    }

    /** A devolucao gravada e se ela foi criada agora (201) ou e a repeticao da chave (200). */
    public record ResultadoDaDevolucao(DevolucaoResponse devolucao, boolean criada) {
    }

    // ---------- Consultar ----------

    /** A venda pelo numero, com o disponivel por linha e por forma; venda cancelada, 409. */
    @Transactional(readOnly = true)
    public VendaParaDevolucaoResponse vendaParaDevolucaoParaUsuario(Long idUsuario, long numero) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario).exigirAdmin();
        Venda venda = vendaRepository.findByEmpresaIdAndNumero(usuario.empresaId(), numero)
                .orElseThrow(VendaNaoEncontradaException::venda);
        if (venda.cancelada()) {
            throw new VendaConflitoException(MENSAGEM_VENDA_CANCELADA, null);
        }
        List<ItemDaVenda> itens = itemRepository.findByEmpresaIdAndVendaIdOrderByOrdemAsc(venda.getEmpresaId(),
                venda.getId());
        Map<Long, LinhaVendida> linhas = linhasVendidas(venda, itens);
        Map<FormaDePagamento, BigDecimal> recebido = recebidoPorForma(venda);
        Map<FormaDePagamento, BigDecimal> reembolsado = recebimentos.reembolsadoPorForma(venda.getEmpresaId(),
                venda.getId());
        String vendedor = usuarioRepository.findById(venda.getUsuarioId()).map(u -> u.getNome()).orElse(null);
        return new VendaParaDevolucaoResponse(venda.getUuid(), venda.getNumero(),
                HorarioDoCaixa.noFuso(relogio, venda.getConcluidaEm()), vendedor, venda.getClienteNome(),
                venda.getTotal(), venda.getTroco(),
                itens.stream().map(item -> linhaParaDevolucao(item, linhas.get(item.getId()))).toList(),
                recebido.entrySet().stream().map(forma -> {
                    BigDecimal jaReembolsado = reembolsado.getOrDefault(forma.getKey(), BigDecimal.ZERO);
                    return new FormaParaReembolso(forma.getKey(), forma.getValue(), jaReembolsado,
                            forma.getValue().subtract(jaReembolsado));
                }).toList(),
                respostas.daVenda(venda, itens));
    }

    private static LinhaParaDevolucao linhaParaDevolucao(ItemDaVenda item, LinhaVendida linha) {
        return new LinhaParaDevolucao(item.getOrdem(), item.getProdutoNome(), linha.unidade(),
                item.getEmbalagemRotulo(), item.isEtiqueta(), linha.fracionada(), item.getPrecoUnitario(),
                item.getQuantidade(), linha.devolvida(), linha.disponivel(), item.getValorLiquido(),
                linha.valorDisponivel());
    }

    // ---------- Devolver ----------

    public ResultadoDaDevolucao devolverParaUsuario(Long idUsuario, UUID vendaId, DevolucaoRequest request) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario).exigirAdmin();
        try {
            return transacao.execute(status -> devolver(usuario, vendaId, request));
        } catch (DataIntegrityViolationException violacao) {
            if (!ViolacaoDeConstraint.violou(violacao, CONSTRAINT_DA_CHAVE)) {
                throw violacao;
            }
            return transacao.execute(status -> devolucaoRepetida(usuario, vendaId, request)
                    .orElseThrow(() -> violacao));
        }
    }

    /** Uma linha pedida, ja conferida: o item da venda, o que devolve e o destino. */
    private record Pedido(ItemDaVenda item, LinhaDevolvida linha, DestinoDaDevolucao destino) {
    }

    private ResultadoDaDevolucao devolver(UsuarioAutenticado usuario, UUID vendaId, DevolucaoRequest request) {
        // A chave vem antes do caixa: a repeticao do mesmo pedido devolve a devolucao gravada.
        Optional<ResultadoDaDevolucao> repetida = devolucaoRepetida(usuario, vendaId, request);
        if (repetida.isPresent()) {
            return repetida.get();
        }
        String motivo = VendasService.motivoValidado(request.motivo());
        SessaoAbertaParaVenda sessao = recebimentos.travarSessaoParaDevolucao(usuario);
        // De novo com a sessao travada: um pedido simultaneo com a mesma chave pode ter acabado de gravar.
        repetida = devolucaoRepetida(usuario, vendaId, request);
        if (repetida.isPresent()) {
            return repetida.get();
        }
        Long empresaId = usuario.empresaId();
        VendaRepository.Referencia referencia = vendaRepository.referencia(empresaId, vendaId)
                .orElseThrow(VendaNaoEncontradaException::venda);
        Venda venda = vendaRepository.travarPorId(empresaId, referencia.id())
                .orElseThrow(VendaNaoEncontradaException::venda);
        if (venda.cancelada()) {
            throw new VendaConflitoException(MENSAGEM_VENDA_CANCELADA, null);
        }
        List<ItemDaVenda> itensDaVenda = itemRepository.findByEmpresaIdAndVendaIdOrderByOrdemAsc(empresaId,
                venda.getId());
        List<Pedido> pedidos = pedidosConferidos(request, itensDaVenda, linhasVendidas(venda, itensDaVenda));
        BigDecimal valor = pedidos.stream().map(pedido -> pedido.linha().valor())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        List<Reembolso> reembolsos = reembolsosConferidos(request.reembolsosOuVazio(), venda, valor);

        estoqueDaVenda.travarSaldos(empresaId, pedidos.stream().map(pedido -> pedido.item().getProdutoId())
                .distinct().toList());
        Devolucao devolucao = devolucaoRepository.saveAndFlush(new Devolucao(new Devolucao.Origem(empresaId,
                venda.getId(), sessao.sessaoId(), usuario.usuarioId(), motivo, valor, request.chave(), agora())));
        List<DevolucaoDeItem> paraOEstoque = new ArrayList<>();
        for (Pedido pedido : pedidos) {
            ItemDaDevolucao item = itemDevolucaoRepository.saveAndFlush(new ItemDaDevolucao(devolucao, pedido.item(),
                    pedido.linha(), pedido.destino()));
            paraOEstoque.add(new DevolucaoDeItem(item.getProdutoId(), item.getItemVendaId(), item.getId(),
                    item.getQuantidadeEstoque(), item.getDestino() == DestinoDaDevolucao.AVARIADO));
        }
        estoqueDaVenda.devolver(empresaId, usuario.usuarioId(), paraOEstoque);
        recebimentos.registrarReembolsos(empresaId, sessao.sessaoId(), venda.getId(), devolucao.getId(),
                usuario.usuarioId(), reembolsos);
        vendaRepository.conferirConstraintsAgora();
        return new ResultadoDaDevolucao(respostas.uma(venda, itensDaVenda, devolucao), true);
    }

    /**
     * As linhas pedidas, conferidas (400 com o campo): ao menos uma, cada linha
     * da venda uma vez, e a quantidade pela {@link CalculadoraDaDevolucao}.
     */
    private static List<Pedido> pedidosConferidos(DevolucaoRequest request, List<ItemDaVenda> itensDaVenda,
            Map<Long, LinhaVendida> linhas) {
        if (request.itens().isEmpty()) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_SEM_ITENS, CAMPO_ITENS);
        }
        Map<Integer, ItemDaVenda> porOrdem = itensDaVenda.stream()
                .collect(Collectors.toMap(ItemDaVenda::getOrdem, Function.identity()));
        Set<Integer> vistas = new HashSet<>();
        List<Pedido> pedidos = new ArrayList<>();
        for (int indice = 0; indice < request.itens().size(); indice++) {
            ItemDevolvido pedido = request.itens().get(indice);
            String campo = CAMPO_ITENS + "[" + indice + "]";
            ItemDaVenda item = porOrdem.get(pedido.ordem());
            if (item == null) {
                throw new DadosDaVendaInvalidosException(MENSAGEM_LINHA_INEXISTENTE, campo + ".ordem");
            }
            if (!vistas.add(pedido.ordem())) {
                throw new DadosDaVendaInvalidosException(MENSAGEM_LINHA_REPETIDA, campo + ".ordem");
            }
            LinhaDevolvida linha = CalculadoraDaDevolucao.calcular(linhas.get(item.getId()), pedido.quantidade(),
                    campo + ".quantidade");
            pedidos.add(new Pedido(item, linha, pedido.destino()));
        }
        return pedidos;
    }

    /**
     * O reembolso informado (regra 4): uma linha por forma, so formas que a
     * venda recebeu, cada uma &gt; 0 e ate o disponivel na forma, e a soma
     * igual ao valor da devolucao (400 com o campo).
     */
    private List<Reembolso> reembolsosConferidos(List<ReembolsoInformado> informados, Venda venda,
            BigDecimal valor) {
        Map<FormaDePagamento, BigDecimal> recebido = recebidoPorForma(venda);
        Map<FormaDePagamento, BigDecimal> reembolsado = recebimentos.reembolsadoPorForma(venda.getEmpresaId(),
                venda.getId());
        Set<FormaDePagamento> vistas = new HashSet<>();
        List<Reembolso> reembolsos = new ArrayList<>();
        BigDecimal soma = BigDecimal.ZERO;
        for (int indice = 0; indice < informados.size(); indice++) {
            ReembolsoInformado informado = informados.get(indice);
            String campo = CAMPO_REEMBOLSOS + "[" + indice + "]";
            if (!vistas.add(informado.forma())) {
                throw new DadosDaVendaInvalidosException(LimitesDoCarrinho.MENSAGEM_UMA_LINHA_POR_FORMA,
                        campo + ".forma");
            }
            BigDecimal recebidoNaForma = recebido.get(informado.forma());
            if (recebidoNaForma == null) {
                throw new DadosDaVendaInvalidosException(
                        MENSAGEM_FORMA_NAO_RECEBIDA.formatted(NOME_DA_FORMA.get(informado.forma())),
                        campo + ".forma");
            }
            if (informado.valor().signum() <= 0) {
                throw new DadosDaVendaInvalidosException(MENSAGEM_REEMBOLSO_POSITIVO, campo + ".valor");
            }
            BigDecimal disponivel = recebidoNaForma.subtract(
                    reembolsado.getOrDefault(informado.forma(), BigDecimal.ZERO));
            if (informado.valor().compareTo(disponivel) > 0) {
                throw new DadosDaVendaInvalidosException(MENSAGEM_REEMBOLSO_ALEM.formatted(
                        NOME_DA_FORMA.get(informado.forma()), FormatoBrasileiro.reais(disponivel)), campo + ".valor");
            }
            reembolsos.add(new Reembolso(informado.forma(), informado.valor().setScale(2)));
            soma = soma.add(informado.valor());
        }
        if (soma.compareTo(valor) != 0) {
            throw new DadosDaVendaInvalidosException(valor.signum() == 0
                    ? MENSAGEM_SEM_VALOR
                    : MENSAGEM_DISTRIBUA.formatted(FormatoBrasileiro.reais(valor)), CAMPO_REEMBOLSOS);
        }
        return reembolsos;
    }

    /** A devolucao ja gravada com a chave, se houver; 409 se ela nao for este mesmo pedido. */
    private Optional<ResultadoDaDevolucao> devolucaoRepetida(UsuarioAutenticado usuario, UUID vendaId,
            DevolucaoRequest request) {
        return devolucaoRepository.findByEmpresaIdAndChaveIdempotencia(usuario.empresaId(), request.chave())
                .map(gravada -> {
                    Venda venda = vendaRepository.findByEmpresaIdAndId(usuario.empresaId(), gravada.getVendaId())
                            .orElseThrow(VendaNaoEncontradaException::venda);
                    List<ItemDaVenda> itens = itemRepository.findByEmpresaIdAndVendaIdOrderByOrdemAsc(
                            usuario.empresaId(), venda.getId());
                    DevolucaoResponse resposta = respostas.uma(venda, itens, gravada);
                    if (!mesmoPedido(usuario, gravada, venda, vendaId, resposta, request)) {
                        throw new VendaConflitoException(VendasService.MENSAGEM_CHAVE_COM_OUTROS_DADOS, null);
                    }
                    return new ResultadoDaDevolucao(resposta, false);
                });
    }

    /** Mesmo usuario, venda, motivo, linhas (ordem, quantidade e destino) e reembolsos (10 = 10,00). */
    private static boolean mesmoPedido(UsuarioAutenticado usuario, Devolucao gravada, Venda venda, UUID vendaId,
            DevolucaoResponse resposta, DevolucaoRequest request) {
        if (!gravada.getUsuarioId().equals(usuario.usuarioId()) || !venda.getUuid().equals(vendaId)
                || !gravada.getMotivo().equals(request.motivo() == null ? null : request.motivo().strip())) {
            return false;
        }
        Map<Integer, DevolucaoResponse.ItemDevolvidoResponse> itens = resposta.itens().stream()
                .collect(Collectors.toMap(DevolucaoResponse.ItemDevolvidoResponse::ordem, Function.identity()));
        // Sem repeticao: [linha 1, linha 1] nao e o mesmo pedido que [linha 1, linha 2].
        boolean semLinhaRepetida = request.itens().stream().map(ItemDevolvido::ordem).distinct().count()
                == request.itens().size();
        boolean mesmosItens = semLinhaRepetida && request.itens().size() == itens.size()
                && request.itens().stream().allMatch(pedido -> {
            DevolucaoResponse.ItemDevolvidoResponse item = itens.get(pedido.ordem());
            return item != null && pedido.quantidade() != null && item.quantidade().compareTo(pedido.quantidade()) == 0
                    && item.destino() == pedido.destino();
        });
        Map<FormaDePagamento, BigDecimal> reembolsos = new HashMap<>();
        resposta.reembolsos().forEach(reembolso -> reembolsos.put(reembolso.forma(), reembolso.valor()));
        List<ReembolsoInformado> informados = request.reembolsosOuVazio();
        boolean semFormaRepetida = informados.stream().map(ReembolsoInformado::forma).distinct().count()
                == informados.size();
        boolean mesmosReembolsos = semFormaRepetida && informados.size() == reembolsos.size() && informados.stream()
                .allMatch(informado -> reembolsos.containsKey(informado.forma())
                        && reembolsos.get(informado.forma()).compareTo(informado.valor()) == 0);
        return mesmosItens && mesmosReembolsos;
    }

    // ---------- Apoio ----------

    /** Cada linha da venda com o ja devolvido (quantidade e valor) e se a unidade do produto e fracionada. */
    private Map<Long, LinhaVendida> linhasVendidas(Venda venda, List<ItemDaVenda> itens) {
        Map<Long, BigDecimal> devolvida = new HashMap<>();
        Map<Long, BigDecimal> valorDevolvido = new HashMap<>();
        itemDevolucaoRepository.findByEmpresaIdAndVendaId(venda.getEmpresaId(), venda.getId()).forEach(item -> {
            devolvida.merge(item.getItemVendaId(), item.getQuantidade(), BigDecimal::add);
            valorDevolvido.merge(item.getItemVendaId(), item.getValor(), BigDecimal::add);
        });
        Map<Long, Boolean> fracionada = produtoRepository.buscarComRelacoesPorIds(venda.getEmpresaId(),
                itens.stream().map(ItemDaVenda::getProdutoId).distinct().toList()).stream()
                .collect(Collectors.toMap(Produto::getId, produto -> produto.getUnidade().isFracionada()));
        Map<Long, LinhaVendida> linhas = new HashMap<>();
        for (ItemDaVenda item : itens) {
            linhas.put(item.getId(), new LinhaVendida(RespostasDaDevolucao.unidadeDaLinha(item),
                    item.getEmbalagemQuantidade(), item.isEtiqueta(),
                    // A linha de embalagem conta embalagens inteiras, mesmo de produto fracionado.
                    item.isEtiqueta() || item.getEmbalagemQuantidade() == null
                            && Objects.requireNonNullElse(fracionada.get(item.getProdutoId()), false),
                    item.getQuantidade(), item.getValorLiquido(),
                    devolvida.getOrDefault(item.getId(), BigDecimal.ZERO),
                    valorDevolvido.getOrDefault(item.getId(), BigDecimal.ZERO)));
        }
        return linhas;
    }

    /** O recebido por forma, na ordem das formas: o pagamento, e no dinheiro sem o troco. */
    private Map<FormaDePagamento, BigDecimal> recebidoPorForma(Venda venda) {
        Map<FormaDePagamento, BigDecimal> recebido = new EnumMap<>(FormaDePagamento.class);
        pagamentoRepository.findByEmpresaIdAndVendaIdIn(venda.getEmpresaId(), List.of(venda.getId()))
                .forEach(pagamento -> {
                    BigDecimal valor = pagamento.getForma() == FormaDePagamento.DINHEIRO
                            ? pagamento.getValor().subtract(venda.getTroco())
                            : pagamento.getValor();
                    if (valor.signum() > 0) {
                        recebido.put(pagamento.getForma(), valor);
                    }
                });
        return recebido;
    }

    private OffsetDateTime agora() {
        return OffsetDateTime.now(relogio).truncatedTo(ChronoUnit.MICROS);
    }
}
