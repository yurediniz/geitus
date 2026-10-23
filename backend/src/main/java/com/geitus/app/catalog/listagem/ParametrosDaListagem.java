package com.geitus.app.catalog.listagem;

import java.util.Objects;
import java.util.UUID;

import com.geitus.app.catalog.Paginacao;

/**
 * Parametros de {@code GET /api/produtos} ja validados (spec 4.2 a 4.4): status,
 * estoque e ordem convertidos pela allow-list dos enums e pagina/tamanho dentro
 * dos limites do {@link Paginacao}. Construir um valor invalido lanca
 * {@code RegraDeNegocioException} (400 com o campo), antes de chegar ao service.
 *
 * @param busca      termo digitado, como recebido ({@code null} = sem busca); o service normaliza
 * @param categoria  UUID publico da categoria (com as descendentes), ou {@code null}
 * @param estoque    filtro de estoque, ou {@code null}
 * @param emPromocao so produtos com promocao vigente hoje
 * @param pagina     pagina a partir de 0
 * @param tamanho    itens por pagina, de 1 a {@value Paginacao#TAMANHO_MAXIMO}
 */
public record ParametrosDaListagem(String busca, StatusFiltro status, UUID categoria, EstoqueFiltro estoque,
        boolean emPromocao, OrdemDeProdutos ordem, int pagina, int tamanho) {

    /** Itens por pagina quando o cliente nao informa (spec 4.4). */
    public static final int TAMANHO_PADRAO = 25;

    public ParametrosDaListagem {
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(ordem, "ordem");
        Paginacao.validar(pagina, tamanho);
    }

    /**
     * Converte os parametros crus da requisicao. Ausentes valem o padrao:
     * {@code ativos}, sem filtro de estoque, sem promocao e ordem {@code nome}.
     */
    public static ParametrosDaListagem daRequisicao(String busca, String status, UUID categoria, String estoque,
            Boolean promocao, String ordem, int pagina, int tamanho) {
        return new ParametrosDaListagem(busca, StatusFiltro.doParametro(status), categoria,
                EstoqueFiltro.doParametro(estoque), Boolean.TRUE.equals(promocao), OrdemDeProdutos.doParametro(ordem),
                pagina, tamanho);
    }
}
