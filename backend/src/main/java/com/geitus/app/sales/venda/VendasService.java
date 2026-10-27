package com.geitus.app.sales.venda;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.cashier.RecebimentosDoCaixa;
import com.geitus.app.cashier.RecebimentosDoCaixa.SessaoAbertaParaVenda;
import com.geitus.app.cashier.RecebimentosDoCaixa.SessaoDaVenda;
import com.geitus.app.cashier.SessoesParaVendas;
import com.geitus.app.cashier.SessoesParaVendas.SessaoParaVenda;
import com.geitus.app.cashier.ViolacaoDeConstraint;
import com.geitus.app.cashier.configuracao.ConfiguracaoDoCaixaService;
import com.geitus.app.cashier.sessao.StatusDaSessao;
import com.geitus.app.customer.ClienteRepository;
import com.geitus.app.iam.ResolvedorDoUsuarioAutenticado;
import com.geitus.app.iam.UsuarioAutenticado;
import com.geitus.app.inventory.EstoqueDaVenda;
import com.geitus.app.inventory.EstoqueDaVenda.BaixaDeItem;
import com.geitus.app.sales.DadosDaVendaInvalidosException;
import com.geitus.app.sales.VendaConflitoException;
import com.geitus.app.sales.VendaNaoEncontradaException;
import com.geitus.app.sales.carrinho.CalculadoraDaVenda;
import com.geitus.app.sales.carrinho.CalculoDaVenda;
import com.geitus.app.sales.carrinho.CalculoDoCarrinho;
import com.geitus.app.sales.carrinho.CalculoDoCarrinho.CalculoConferido;
import com.geitus.app.sales.carrinho.LinhaCalculada;
import com.geitus.app.sales.carrinho.MontagemDoCarrinho;
import com.geitus.app.sales.carrinho.MontagemDoCarrinho.CarrinhoMontado;
import com.geitus.app.sales.dto.CarrinhoRequest;
import com.geitus.app.sales.dto.ItemDoCarrinhoRequest;
import com.geitus.app.sales.dto.PagamentoRequest;
import com.geitus.app.sales.venda.ConsultaDeVendas.Criterios;
import com.geitus.app.sales.venda.ConsultaDeVendas.PaginaDeVendas;
import com.geitus.app.sales.venda.ItemDaVendaRepository.ProdutoDoItem;
import com.geitus.app.sales.venda.dto.CancelamentoRequest;
import com.geitus.app.sales.venda.dto.FinalizarVendaRequest;
import com.geitus.app.sales.venda.dto.VendaResponse;
import com.geitus.app.shared.formato.FormatoBrasileiro;
import com.geitus.app.shared.numeracao.Numerador;
import com.geitus.app.shared.numeracao.TipoNumeracao;
import com.geitus.app.shared.paginacao.PaginaResponse;
import com.geitus.app.shared.paginacao.Paginacao;

/**
 * Finalizacao, consulta e cancelamento das vendas (docs/modules/pdv.md).
 *
 * <p><b>Finalizar</b>, num pedido atomico, nesta ordem: resolver o usuario
 * (empresa e perfil do banco); conferir a chave (a repeticao do mesmo pedido
 * devolve a venda original mesmo com o caixa ja fechado); travar a sessao
 * aberta dele; conferir a chave de novo; travar os produtos em ordem de id; montar o carrinho com os dados ja
 * travados; recalcular tudo; conferir o {@code totalEsperado}; validar (400 com
 * os campos; 409 no estoque com "Vender sem estoque" desligada); gravar a
 * venda, os itens e os pagamentos; baixar o estoque e registrar os
 * recebimentos no caixa. A corrida de duas finalizacoes com a mesma chave em
 * sessoes diferentes chega a {@code uq_venda_chave}: a transacao perdedora e
 * desfeita e uma nova le a venda que ganhou.
 *
 * <p><b>Cancelar</b>: travar a sessao da venda, depois a venda e os produtos
 * em ordem de id (a mesma ordem da venda, DT-032), e gravar o cancelamento, os
 * estornos de estoque e os de caixa (com o mesmo valor dos recebimentos).
 *
 * <p>Regra do dono: o OPERADOR so ve e cancela as vendas das sessoes que ele
 * abriu (o vendedor e sempre o dono da sessao); outra pessoa ou outra empresa,
 * 404.
 */
@Service
public class VendasService {

    static final String CAMPO_TOTAL_ESPERADO = "totalEsperado";
    static final String CAMPO_ITENS = "itens";
    static final String CAMPO_PAGAMENTOS = "pagamentos";
    static final String CAMPO_MOTIVO = "motivo";
    static final int TAMANHO_MAXIMO_DO_MOTIVO = 200;

    static final String MENSAGEM_CHAVE_COM_OUTROS_DADOS = "Esta operação já foi registrada com outros dados.";
    static final String MENSAGEM_TOTAL_MUDOU = "O total da venda mudou. Confira os valores.";
    static final String MENSAGEM_SEM_ITENS = "Adicione um item à venda.";
    static final String MENSAGEM_FALTA_PAGAR = "Falta pagar %s.";
    static final String MENSAGEM_JA_CANCELADA = "Esta venda já foi cancelada.";
    static final String MENSAGEM_CAIXA_NAO_ABERTO =
            "Esta venda é de um caixa que já foi fechado ou está em conferência. Use devolução.";
    static final String MENSAGEM_MOTIVO_VAZIO = "Informe o motivo.";
    static final String MENSAGEM_MOTIVO_LONGO = "O motivo deve ter até 200 caracteres.";

    private static final String CONSTRAINT_DA_CHAVE = "uq_venda_chave";

    private final ResolvedorDoUsuarioAutenticado resolvedor;
    private final RecebimentosDoCaixa recebimentos;
    private final SessoesParaVendas sessoes;
    private final ConfiguracaoDoCaixaService configuracaoDoCaixa;
    private final EstoqueDaVenda estoqueDaVenda;
    private final MontagemDoCarrinho montagem;
    private final CalculoDoCarrinho calculoDoCarrinho;
    private final Numerador numerador;
    private final VendaRepository vendaRepository;
    private final ItemDaVendaRepository itemRepository;
    private final PagamentoDaVendaRepository pagamentoRepository;
    private final ClienteRepository clienteRepository;
    private final ConsultaDeVendas consultaDeVendas;
    private final RespostasDaVenda respostas;
    private final Clock relogio;
    private final TransactionTemplate transacao;

    @SuppressWarnings("java:S107") // As colaboracoes da venda atomica: caixa, estoque, carrinho, numeracao e gravacao.
    public VendasService(ResolvedorDoUsuarioAutenticado resolvedor, RecebimentosDoCaixa recebimentos,
            SessoesParaVendas sessoes, ConfiguracaoDoCaixaService configuracaoDoCaixa, EstoqueDaVenda estoqueDaVenda,
            MontagemDoCarrinho montagem, CalculoDoCarrinho calculoDoCarrinho, Numerador numerador,
            ClienteRepository clienteRepository, Clock relogio, VendaRepository vendaRepository,
            ItemDaVendaRepository itemRepository, PagamentoDaVendaRepository pagamentoRepository,
            ConsultaDeVendas consultaDeVendas, RespostasDaVenda respostas,
            PlatformTransactionManager gerenciadorDeTransacoes) {
        this.resolvedor = resolvedor;
        this.recebimentos = recebimentos;
        this.sessoes = sessoes;
        this.configuracaoDoCaixa = configuracaoDoCaixa;
        this.estoqueDaVenda = estoqueDaVenda;
        this.montagem = montagem;
        this.calculoDoCarrinho = calculoDoCarrinho;
        this.numerador = numerador;
        this.clienteRepository = clienteRepository;
        this.relogio = relogio;
        this.vendaRepository = vendaRepository;
        this.itemRepository = itemRepository;
        this.pagamentoRepository = pagamentoRepository;
        this.consultaDeVendas = consultaDeVendas;
        this.respostas = respostas;
        this.transacao = new TransactionTemplate(gerenciadorDeTransacoes);
    }

    /** Venda da resposta e se foi gravada agora ({@code true}, 201) ou ja existia pela chave (200). */
    public record ResultadoDaVenda(VendaResponse venda, boolean criada) {
    }

    // ---------- Finalizar ----------

    public ResultadoDaVenda finalizarParaUsuario(Long idUsuario, FinalizarVendaRequest request) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario);
        if (request.itens().size() > CalculadoraDaVenda.LIMITE_DE_LINHAS) {
            // Antes de qualquer trava: um carrinho grande demais nao segura a sessao nem os produtos.
            throw new DadosDaVendaInvalidosException(CalculadoraDaVenda.MENSAGEM_LIMITE_DE_LINHAS, CAMPO_ITENS);
        }
        try {
            return transacao.execute(status -> finalizar(usuario, request));
        } catch (DataIntegrityViolationException violacao) {
            if (!ViolacaoDeConstraint.violou(violacao, CONSTRAINT_DA_CHAVE)) {
                throw violacao;
            }
            return transacao.execute(status -> vendaRepetida(usuario, request).orElseThrow(() -> violacao));
        }
    }

    private ResultadoDaVenda finalizar(UsuarioAutenticado usuario, FinalizarVendaRequest request) {
        // A chave vem antes da sessao: a repeticao do mesmo pedido devolve a venda original mesmo que o
        // caixa dela ja tenha fechado (a rede caiu depois de gravar e o operador fechou o caixa).
        Optional<ResultadoDaVenda> repetida = vendaRepetida(usuario, request);
        if (repetida.isPresent()) {
            return repetida.get();
        }
        SessaoAbertaParaVenda sessao = recebimentos.travarSessaoParaVenda(usuario);
        // De novo com a sessao travada: um pedido simultaneo com a mesma chave pode ter acabado de gravar.
        repetida = vendaRepetida(usuario, request);
        if (repetida.isPresent()) {
            return repetida.get();
        }
        CarrinhoRequest carrinho = request.carrinho();
        Long empresaId = usuario.empresaId();
        Map<Long, BigDecimal> saldos = estoqueDaVenda.travarSaldos(empresaId,
                montagem.idsDosProdutos(usuario, carrinho));
        CarrinhoMontado montado = montagem.montar(usuario, carrinho);
        CalculoDaVenda calculo = calculoConferido(usuario, carrinho, montado, saldos, request.totalEsperado());
        Venda venda = vendaRepository.saveAndFlush(new Venda(new Venda.Origem(empresaId, sessao.sessaoId(),
                usuario.usuarioId(), numerador.proximo(empresaId, TipoNumeracao.VENDA), request.chave(), agora()),
                calculo, montado.cliente()));
        List<BaixaDeItem> baixas = new ArrayList<>();
        for (LinhaCalculada linha : calculo.linhas()) {
            ItemDaVenda item = itemRepository.saveAndFlush(new ItemDaVenda(venda, linha));
            baixas.add(new BaixaDeItem(item.getProdutoId(), item.getId(), item.getQuantidadeEstoque()));
        }
        calculo.pagamentosPorForma().forEach((forma, valor) -> pagamentoRepository.saveAndFlush(
                new PagamentoDaVenda(venda, forma, valor)));
        estoqueDaVenda.baixar(empresaId, usuario.usuarioId(), baixas);
        recebimentos.registrarRecebimentos(empresaId, sessao.sessaoId(), venda.getId(), usuario.usuarioId(),
                calculo.recebidosPorForma());
        vendaRepository.conferirConstraintsAgora();
        return new ResultadoDaVenda(respostas.completa(venda, usuario), true);
    }

    /**
     * Recalcula com os dados ja travados e confere, nesta ordem: o total
     * esperado (409), as regras do carrinho (400 com os campos), o carrinho
     * vazio e o pagamento ausente (400) e o estoque com "Vender sem estoque"
     * desligada (409 com os campos).
     */
    private CalculoDaVenda calculoConferido(UsuarioAutenticado usuario, CarrinhoRequest carrinho,
            CarrinhoMontado montado, Map<Long, BigDecimal> saldos, BigDecimal totalEsperado) {
        CalculoConferido conferido = calculoDoCarrinho.calcular(usuario, carrinho, montado, saldos);
        CalculoDaVenda calculo = conferido.calculo();
        if (calculo.total().compareTo(totalEsperado) != 0) {
            throw new VendaConflitoException(MENSAGEM_TOTAL_MUDOU, CAMPO_TOTAL_ESPERADO);
        }
        if (!calculo.erros().isEmpty()) {
            throw new DadosDaVendaInvalidosException(calculo.erros());
        }
        if (calculo.linhas().isEmpty()) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_SEM_ITENS, CAMPO_ITENS);
        }
        if (carrinho.pagamentos().isEmpty()) {
            throw new DadosDaVendaInvalidosException(
                    MENSAGEM_FALTA_PAGAR.formatted(FormatoBrasileiro.reais(calculo.total())), CAMPO_PAGAMENTOS);
        }
        if (!conferido.estoque().erros().isEmpty()) {
            throw new VendaConflitoException(conferido.estoque().erros());
        }
        return calculo;
    }

    /** A venda ja gravada com a chave, se houver; 409 se ela nao for este mesmo pedido. */
    private Optional<ResultadoDaVenda> vendaRepetida(UsuarioAutenticado usuario, FinalizarVendaRequest request) {
        return vendaRepository.findByEmpresaIdAndChaveIdempotencia(usuario.empresaId(), request.chave())
                .map(gravada -> {
                    if (!mesmoPedido(usuario, gravada, request)) {
                        throw new VendaConflitoException(MENSAGEM_CHAVE_COM_OUTROS_DADOS, null);
                    }
                    return new ResultadoDaVenda(respostas.completa(gravada, usuario), false);
                });
    }

    /**
     * Mesmo vendedor, total, cliente, pagamentos (10 = 10,00) e itens (produto,
     * etiqueta, texto lido e, fora da etiqueta, a quantidade), na ordem.
     */
    private boolean mesmoPedido(UsuarioAutenticado usuario, Venda gravada, FinalizarVendaRequest request) {
        return gravada.getUsuarioId().equals(usuario.usuarioId())
                && gravada.getTotal().compareTo(request.totalEsperado()) == 0
                && mesmoCliente(usuario, gravada, request.clienteId())
                && mesmosPagamentos(gravada, request.carrinho().pagamentos())
                && mesmosItens(gravada, request.itens());
    }

    private boolean mesmoCliente(UsuarioAutenticado usuario, Venda gravada, UUID clienteId) {
        if (clienteId == null) {
            return gravada.getClienteId() == null;
        }
        return clienteRepository.findByUuidAndEmpresa_Id(clienteId, usuario.empresaId())
                .map(cliente -> cliente.getId().equals(gravada.getClienteId()))
                .orElse(false);
    }

    private boolean mesmosPagamentos(Venda gravada, List<PagamentoRequest> pedidos) {
        Map<FormaDePagamento, BigDecimal> gravados = new EnumMap<>(FormaDePagamento.class);
        pagamentoRepository.findByEmpresaIdAndVendaIdIn(gravada.getEmpresaId(), List.of(gravada.getId()))
                .forEach(pagamento -> gravados.put(pagamento.getForma(), pagamento.getValor()));
        if (gravados.size() != pedidos.size()) {
            return false;
        }
        return pedidos.stream().allMatch(pedido -> pedido.valor() != null
                && gravados.containsKey(pedido.forma())
                && gravados.get(pedido.forma()).compareTo(pedido.valor()) == 0);
    }

    private boolean mesmosItens(Venda gravada, List<ItemDoCarrinhoRequest> pedidos) {
        List<ItemDaVenda> itens = itemRepository.findByEmpresaIdAndVendaIdOrderByOrdemAsc(gravada.getEmpresaId(),
                gravada.getId());
        List<ProdutoDoItem> produtos = itemRepository.produtosDosItens(gravada.getEmpresaId(), gravada.getId());
        if (itens.size() != pedidos.size() || produtos.size() != pedidos.size()) {
            return false;
        }
        for (int indice = 0; indice < pedidos.size(); indice++) {
            ItemDoCarrinhoRequest pedido = pedidos.get(indice);
            ItemDaVenda item = itens.get(indice);
            boolean mesmo = produtos.get(indice).produtoId().equals(pedido.produtoId())
                    && item.isEtiqueta() == pedido.ehEtiqueta()
                    && Objects.equals(item.getCodigoLido(), textoOuNulo(pedido.codigoLido()))
                    && (item.isEtiqueta() || (pedido.quantidade() != null
                            && item.getQuantidade().compareTo(pedido.quantidade()) == 0));
            if (!mesmo) {
                return false;
            }
        }
        return true;
    }

    // ---------- Consultas ----------

    @Transactional(readOnly = true)
    public VendaResponse detalheParaUsuario(Long idUsuario, UUID vendaId) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario);
        Venda venda = vendaRepository.findByEmpresaIdAndUuid(usuario.empresaId(), vendaId)
                .filter(encontrada -> podeVer(usuario, encontrada.getUsuarioId()))
                .orElseThrow(VendaNaoEncontradaException::venda);
        return respostas.completa(venda, usuario);
    }

    /**
     * Vendas da mais recente: o OPERADOR so as das proprias sessoes; o ADMIN,
     * todas. Sem sessao e sem periodo, a sessao atual do usuario (sem sessao
     * atual, pagina vazia); com periodo e sem sessao, todas as que ele pode ver.
     */
    @Transactional(readOnly = true)
    public PaginaResponse<VendaResponse> listarParaUsuario(Long idUsuario, FiltroDeVendas filtro, int pagina,
            int tamanho) {
        Paginacao.validar(pagina, tamanho);
        filtro.validar();
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario);
        Optional<SessaoParaVenda> sessao = filtro.usaASessaoAtual()
                ? sessoes.atualDoUsuario(usuario)
                : Optional.ofNullable(filtro.sessaoId()).flatMap(id -> sessoes.porUuid(usuario.empresaId(), id));
        boolean filtraPorSessao = filtro.usaASessaoAtual() || filtro.sessaoId() != null;
        if (filtraPorSessao && sessao.isEmpty()) {
            return new PaginaResponse<>(List.of(), pagina, tamanho, 0);
        }
        ZoneId fuso = relogio.getZone();
        PaginaDeVendas vendas = consultaDeVendas.buscar(new Criterios(usuario.empresaId(),
                usuario.ehAdmin() ? null : usuario.usuarioId(), sessao.map(SessaoParaVenda::id).orElse(null),
                filtro.status(), filtro.numero(), filtro.inicio(fuso), filtro.fim(fuso)), pagina, tamanho);
        return new PaginaResponse<>(respostas.resumos(vendas.vendas(), usuario), pagina, tamanho, vendas.total());
    }

    // ---------- Cancelar ----------

    @Transactional
    public VendaResponse cancelarParaUsuario(Long idUsuario, UUID vendaId, CancelamentoRequest request) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario);
        String motivo = motivoValidado(request.motivo());
        Long empresaId = usuario.empresaId();
        VendaRepository.Referencia referencia = vendaRepository.referencia(empresaId, vendaId)
                .filter(encontrada -> podeVer(usuario, encontrada.vendedorId()))
                .orElseThrow(VendaNaoEncontradaException::venda);
        SessaoDaVenda sessao = recebimentos.travarSessaoDaVenda(empresaId, referencia.sessaoId());
        Venda venda = vendaRepository.travarPorId(empresaId, referencia.id())
                .orElseThrow(VendaNaoEncontradaException::venda);
        if (venda.cancelada()) {
            if (!motivo.equals(venda.getMotivoCancelamento())) {
                throw new VendaConflitoException(MENSAGEM_JA_CANCELADA, null);
            }
            return respostas.completa(venda, usuario);
        }
        if (sessao.status() != StatusDaSessao.ABERTA) {
            throw new VendaConflitoException(MENSAGEM_CAIXA_NAO_ABERTO, null);
        }
        List<ItemDaVenda> itens = itemRepository.findByEmpresaIdAndVendaIdOrderByOrdemAsc(empresaId, venda.getId());
        estoqueDaVenda.travarSaldos(empresaId, itens.stream().map(ItemDaVenda::getProdutoId).distinct().toList());
        boolean escondeValor = !usuario.ehAdmin() && configuracaoDoCaixa.fechamentoCego(empresaId);
        recebimentos.registrarEstornos(empresaId, referencia.sessaoId(), venda.getId(), usuario.usuarioId(),
                escondeValor);
        estoqueDaVenda.estornar(empresaId, usuario.usuarioId(), itens.stream()
                .map(item -> new BaixaDeItem(item.getProdutoId(), item.getId(), item.getQuantidadeEstoque()))
                .toList());
        venda.cancelar(usuario.usuarioId(), agora(), motivo);
        Venda cancelada = vendaRepository.saveAndFlush(venda);
        vendaRepository.conferirConstraintsAgora();
        return respostas.completa(cancelada, usuario);
    }

    private static String motivoValidado(String motivo) {
        String aparado = motivo == null ? "" : motivo.strip();
        if (aparado.isEmpty()) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_MOTIVO_VAZIO, CAMPO_MOTIVO);
        }
        if (aparado.length() > TAMANHO_MAXIMO_DO_MOTIVO) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_MOTIVO_LONGO, CAMPO_MOTIVO);
        }
        return aparado;
    }

    // ---------- Apoio ----------

    /** ADMIN ve todas; o OPERADOR, as das sessoes que abriu (ele e o vendedor delas). */
    private static boolean podeVer(UsuarioAutenticado usuario, Long vendedorId) {
        return usuario.ehAdmin() || usuario.usuarioId().equals(vendedorId);
    }

    private static String textoOuNulo(String texto) {
        return texto == null || texto.isBlank() ? null : texto.strip();
    }

    private OffsetDateTime agora() {
        return OffsetDateTime.now(relogio).truncatedTo(ChronoUnit.MICROS);
    }
}
