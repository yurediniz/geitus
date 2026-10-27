package com.geitus.app.sales.venda;

import java.time.Clock;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.geitus.app.cashier.HorarioDoCaixa;
import com.geitus.app.cashier.SessoesParaVendas;
import com.geitus.app.cashier.SessoesParaVendas.SessaoParaVenda;
import com.geitus.app.iam.UsuarioAutenticado;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.sales.venda.dto.VendaResponse;
import com.geitus.app.sales.venda.dto.VendaResponse.CancelamentoResponse;
import com.geitus.app.sales.venda.dto.VendaResponse.ItemDaVendaResponse;
import com.geitus.app.sales.venda.dto.VendaResponse.PagamentoResponse;

/**
 * Monta a {@link VendaResponse} para quem consulta (docs/modules/pdv.md):
 * o ponto e a situacao da sessao (para o {@code podeCancelar}), os nomes e os
 * pagamentos em lote (uma consulta de cada, qualquer que seja a pagina) e, no
 * detalhe, os itens. O custo nunca sai. Exige a transacao de quem chama.
 */
@Component
class RespostasDaVenda {

    private final ItemDaVendaRepository itemRepository;
    private final PagamentoDaVendaRepository pagamentoRepository;
    private final SessoesParaVendas sessoes;
    private final UsuarioRepository usuarioRepository;
    private final Clock relogio;

    RespostasDaVenda(ItemDaVendaRepository itemRepository, PagamentoDaVendaRepository pagamentoRepository,
            SessoesParaVendas sessoes, UsuarioRepository usuarioRepository, Clock relogio) {
        this.itemRepository = itemRepository;
        this.pagamentoRepository = pagamentoRepository;
        this.sessoes = sessoes;
        this.usuarioRepository = usuarioRepository;
        this.relogio = relogio;
    }

    /** A venda com os itens (detalhe, finalizar e cancelar). */
    VendaResponse completa(Venda venda, UsuarioAutenticado quemVe) {
        List<ItemDaVendaResponse> itens = itemRepository
                .findByEmpresaIdAndVendaIdOrderByOrdemAsc(venda.getEmpresaId(), venda.getId()).stream()
                .map(RespostasDaVenda::item)
                .toList();
        return respostas(List.of(venda), quemVe, Map.of(venda.getId(), itens)).get(0);
    }

    /** As vendas sem os itens (a lista). */
    List<VendaResponse> resumos(List<Venda> vendas, UsuarioAutenticado quemVe) {
        return vendas.isEmpty() ? List.of() : respostas(vendas, quemVe, Map.of());
    }

    private List<VendaResponse> respostas(List<Venda> vendas, UsuarioAutenticado quemVe,
            Map<Long, List<ItemDaVendaResponse>> itens) {
        Long empresaId = quemVe.empresaId();
        Map<Long, SessaoParaVenda> sessoesDasVendas = sessoes.porIds(empresaId,
                vendas.stream().map(Venda::getSessaoCaixaId).collect(Collectors.toSet()));
        Map<Long, List<PagamentoResponse>> pagamentos = pagamentoRepository
                .findByEmpresaIdAndVendaIdIn(empresaId, vendas.stream().map(Venda::getId).toList()).stream()
                .collect(Collectors.groupingBy(PagamentoDaVenda::getVendaId, Collectors.mapping(
                        pagamento -> new PagamentoResponse(pagamento.getForma(), pagamento.getValor()),
                        Collectors.toList())));
        pagamentos.values().forEach(lista -> lista.sort((a, b) -> a.forma().compareTo(b.forma())));
        Map<Long, String> nomes = nomes(vendas);
        return vendas.stream()
                .map(venda -> resposta(venda, quemVe, sessoesDasVendas.get(venda.getSessaoCaixaId()), nomes,
                        itens.get(venda.getId()), pagamentos.getOrDefault(venda.getId(), List.of())))
                .toList();
    }

    private VendaResponse resposta(Venda venda, UsuarioAutenticado quemVe, SessaoParaVenda sessao,
            Map<Long, String> nomes, List<ItemDaVendaResponse> itens, List<PagamentoResponse> pagamentos) {
        CancelamentoResponse cancelamento = venda.cancelada()
                ? new CancelamentoResponse(nomes.get(venda.getCanceladaPor()),
                        HorarioDoCaixa.noFuso(relogio, venda.getCanceladaEm()), venda.getMotivoCancelamento())
                : null;
        return new VendaResponse(venda.getUuid(), venda.getNumero(), venda.getStatus(), sessao.uuid(),
                sessao.pontoNome(), nomes.get(venda.getUsuarioId()), venda.getClienteNome(), venda.getSubtotal(),
                venda.getDescontoItens(), venda.getDescontoTotal(), venda.getTotal(), venda.getTroco(),
                HorarioDoCaixa.noFuso(relogio, venda.getConcluidaEm()), itens, pagamentos, cancelamento,
                podeCancelar(venda, sessao, quemVe));
    }

    /** Concluida, com o caixa da venda aberto, e quem consulta e o dono da sessao ou ADMIN. */
    static boolean podeCancelar(Venda venda, SessaoParaVenda sessao, UsuarioAutenticado quemVe) {
        return !venda.cancelada() && sessao.aberta()
                && (quemVe.ehAdmin() || sessao.abertaPor().equals(quemVe.usuarioId()));
    }

    private static ItemDaVendaResponse item(ItemDaVenda item) {
        return new ItemDaVendaResponse(item.getOrdem(), item.getProdutoNome(), item.getCodigoLido(),
                item.getEmbalagemRotulo(), item.isEtiqueta(), item.getQuantidade(), item.getUnidadeSigla(),
                item.getPrecoUnitario(), item.getOrigemPreco(), item.getValorBruto(), item.getDescontoItem(),
                item.getDescontoRateado(), item.getValorLiquido());
    }

    private Map<Long, String> nomes(Collection<Venda> vendas) {
        Set<Long> usuarios = new HashSet<>();
        vendas.forEach(venda -> {
            usuarios.add(venda.getUsuarioId());
            if (venda.getCanceladaPor() != null) {
                usuarios.add(venda.getCanceladaPor());
            }
        });
        Map<Long, String> nomes = new HashMap<>();
        usuarioRepository.findAllById(usuarios).forEach(usuario -> nomes.put(usuario.getId(), usuario.getNome()));
        return nomes;
    }
}
