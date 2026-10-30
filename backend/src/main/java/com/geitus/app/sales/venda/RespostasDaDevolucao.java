package com.geitus.app.sales.venda;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.geitus.app.cashier.HorarioDoCaixa;
import com.geitus.app.cashier.RecebimentosDoCaixa;
import com.geitus.app.cashier.RecebimentosDoCaixa.Reembolso;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.sales.venda.dto.DevolucaoResponse;
import com.geitus.app.sales.venda.dto.DevolucaoResponse.ItemDevolvidoResponse;
import com.geitus.app.sales.venda.dto.DevolucaoResponse.ReembolsoResponse;

/**
 * Monta as {@link DevolucaoResponse} de uma venda (docs/modules/estoque.md,
 * secao 6.2) e a situacao de devolucao dela. Os itens, os reembolsos e os nomes
 * saem em lote (uma consulta de cada, qualquer que seja o numero de
 * devolucoes). Exige a transacao de quem chama.
 */
@Component
class RespostasDaDevolucao {

    private final DevolucaoRepository devolucaoRepository;
    private final ItemDaDevolucaoRepository itemDevolucaoRepository;
    private final RecebimentosDoCaixa recebimentos;
    private final UsuarioRepository usuarioRepository;
    private final Clock relogio;

    RespostasDaDevolucao(DevolucaoRepository devolucaoRepository, ItemDaDevolucaoRepository itemDevolucaoRepository,
            RecebimentosDoCaixa recebimentos, UsuarioRepository usuarioRepository, Clock relogio) {
        this.devolucaoRepository = devolucaoRepository;
        this.itemDevolucaoRepository = itemDevolucaoRepository;
        this.recebimentos = recebimentos;
        this.usuarioRepository = usuarioRepository;
        this.relogio = relogio;
    }

    /** Todas as devolucoes da venda, da mais antiga, com os itens da venda ja carregados. */
    List<DevolucaoResponse> daVenda(Venda venda, List<ItemDaVenda> itensDaVenda) {
        return respostas(venda, itensDaVenda,
                devolucaoRepository.findByEmpresaIdAndVendaIdOrderByCriadaEmAscIdAsc(venda.getEmpresaId(),
                        venda.getId()));
    }

    /** Uma devolucao gravada (a resposta do POST e da repeticao pela chave). */
    DevolucaoResponse uma(Venda venda, List<ItemDaVenda> itensDaVenda, Devolucao devolucao) {
        return respostas(venda, itensDaVenda, List.of(devolucao)).get(0);
    }

    /** NENHUMA sem devolucao; TOTAL com todas as linhas devolvidas por inteiro; PARCIAL nos demais. */
    SituacaoDeDevolucao situacao(List<ItemDaVenda> itensDaVenda, Map<Long, BigDecimal> devolvidaPorItem) {
        if (devolvidaPorItem.isEmpty()) {
            return SituacaoDeDevolucao.NENHUMA;
        }
        boolean tudo = itensDaVenda.stream().allMatch(item -> item.getQuantidade()
                .compareTo(devolvidaPorItem.getOrDefault(item.getId(), BigDecimal.ZERO)) == 0);
        return tudo ? SituacaoDeDevolucao.TOTAL : SituacaoDeDevolucao.PARCIAL;
    }

    /**
     * A situacao de devolucao de cada venda da lista, em duas consultas (os
     * itens e o devolvido de todas): {@code comDevolucao} sao as vendas que ja
     * tem devolucao; as demais ficam NENHUMA.
     */
    Map<Long, SituacaoDeDevolucao> situacoes(Long empresaId, Set<Long> comDevolucao,
            Function<Set<Long>, List<ItemDaVenda>> itensDasVendas) {
        if (comDevolucao.isEmpty()) {
            return Map.of();
        }
        Map<Long, BigDecimal> devolvidaPorItem = itemDevolucaoRepository
                .findByEmpresaIdAndVendaIdIn(empresaId, comDevolucao).stream()
                .collect(Collectors.groupingBy(ItemDaDevolucao::getItemVendaId,
                        Collectors.reducing(BigDecimal.ZERO, ItemDaDevolucao::getQuantidade, BigDecimal::add)));
        Map<Long, List<ItemDaVenda>> itensPorVenda = itensDasVendas.apply(comDevolucao).stream()
                .collect(Collectors.groupingBy(ItemDaVenda::getVendaId));
        // O id do item e unico: o mapa de todas as vendas serve a cada uma (e nao e vazio, todas tem devolucao).
        Map<Long, SituacaoDeDevolucao> situacoes = new HashMap<>();
        itensPorVenda.forEach((vendaId, itens) -> situacoes.put(vendaId, situacao(itens, devolvidaPorItem)));
        return situacoes;
    }

    /** A soma devolvida de cada item da venda (id interno do item), na unidade da linha. */
    Map<Long, BigDecimal> devolvidaPorItem(Venda venda) {
        return itemDevolucaoRepository.findByEmpresaIdAndVendaId(venda.getEmpresaId(), venda.getId()).stream()
                .collect(Collectors.groupingBy(ItemDaDevolucao::getItemVendaId,
                        Collectors.reducing(BigDecimal.ZERO, ItemDaDevolucao::getQuantidade, BigDecimal::add)));
    }

    private List<DevolucaoResponse> respostas(Venda venda, List<ItemDaVenda> itensDaVenda,
            List<Devolucao> devolucoes) {
        if (devolucoes.isEmpty()) {
            return List.of();
        }
        Long empresaId = venda.getEmpresaId();
        List<Long> ids = devolucoes.stream().map(Devolucao::getId).toList();
        Map<Long, ItemDaVenda> itensPorId = itensDaVenda.stream()
                .collect(Collectors.toMap(ItemDaVenda::getId, Function.identity()));
        Map<Long, List<ItemDevolvidoResponse>> itens = itemDevolucaoRepository
                .findByEmpresaIdAndDevolucaoIdInOrderByIdAsc(empresaId, ids).stream()
                .collect(Collectors.groupingBy(ItemDaDevolucao::getDevolucaoId,
                        Collectors.mapping(item -> item(item, itensPorId.get(item.getItemVendaId())),
                                Collectors.toList())));
        Map<Long, List<Reembolso>> reembolsos = recebimentos.reembolsosDasDevolucoes(empresaId, ids);
        Map<Long, String> nomes = new HashMap<>();
        usuarioRepository.findAllById(devolucoes.stream().map(Devolucao::getUsuarioId).collect(Collectors.toSet()))
                .forEach(usuario -> nomes.put(usuario.getId(), usuario.getNome()));
        return devolucoes.stream()
                .map(devolucao -> new DevolucaoResponse(devolucao.getUuid(), venda.getUuid(), venda.getNumero(),
                        devolucao.getValor(), devolucao.getMotivo(),
                        HorarioDoCaixa.noFuso(relogio, devolucao.getCriadaEm()), nomes.get(devolucao.getUsuarioId()),
                        itens.getOrDefault(devolucao.getId(), List.of()),
                        reembolsos.getOrDefault(devolucao.getId(), List.of()).stream()
                                .map(reembolso -> new ReembolsoResponse(reembolso.forma(), reembolso.valor()))
                                .toList()))
                .toList();
    }

    private static ItemDevolvidoResponse item(ItemDaDevolucao devolvido, ItemDaVenda daVenda) {
        return new ItemDevolvidoResponse(daVenda.getOrdem(), daVenda.getProdutoNome(), devolvido.getQuantidade(),
                unidadeDaLinha(daVenda), devolvido.getValor(), devolvido.getDestino());
    }

    /** O que a quantidade da linha conta: o rotulo da embalagem ou a sigla da unidade. */
    static String unidadeDaLinha(ItemDaVenda item) {
        return item.getEmbalagemRotulo() != null ? item.getEmbalagemRotulo() : item.getUnidadeSigla();
    }

    /** Destas vendas, as que tem devolucao (o {@code podeCancelar} da lista), numa consulta. */
    Set<Long> vendasComDevolucao(Long empresaId, List<Long> vendaIds) {
        return vendaIds.isEmpty() ? Set.of() : Set.copyOf(devolucaoRepository.vendasComDevolucao(empresaId, vendaIds));
    }
}
