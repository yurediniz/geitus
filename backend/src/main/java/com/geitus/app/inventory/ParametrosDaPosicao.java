package com.geitus.app.inventory;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.listagem.OrdemDaPosicao;
import com.geitus.app.catalog.listagem.ParametrosDaListagem;
import com.geitus.app.catalog.listagem.SituacaoDaPosicao;
import com.geitus.app.catalog.listagem.StatusFiltro;
import com.geitus.app.shared.paginacao.Paginacao;

/**
 * Parametros de {@code GET /api/estoque/posicao} ja validados (spec de Estoque,
 * regra 23): status, situacao e ordem pela allow-list, a busca dentro do mesmo
 * teto da listagem de produtos e pagina/tamanho dentro do {@link Paginacao}.
 * Valor invalido lanca {@link RegraDeNegocioException} (400 com o campo).
 *
 * @param busca     termo digitado, como recebido ({@code null} = sem busca)
 * @param status    filtro de status; {@code null} vale {@link StatusFiltro#ATIVOS}
 * @param categorias UUIDs publicos das categorias (cada uma com as descendentes), combinadas com OU, no
 *                  maximo {@value ParametrosDaListagem#MAXIMO_DE_CATEGORIAS}; vazio (ou {@code null}) e sem filtro
 * @param situacao  situacoes do filtro, combinadas com OU; vazio (ou {@code null}) e sem filtro
 * @param ordem     ordenacao; {@code null} vale {@link OrdemDaPosicao#NOME}
 * @param pagina    pagina a partir de 0
 * @param tamanho   itens por pagina, de 1 a {@value Paginacao#TAMANHO_MAXIMO}
 */
public record ParametrosDaPosicao(String busca, StatusFiltro status, Set<UUID> categorias,
        Set<SituacaoDaPosicao> situacao, OrdemDaPosicao ordem, int pagina, int tamanho) {

    static final String MENSAGEM_BUSCA_LONGA = "A busca deve ter no máximo 200 caracteres.";
    static final String CAMPO_BUSCA = "busca";

    public ParametrosDaPosicao {
        status = Objects.requireNonNullElse(status, StatusFiltro.ATIVOS);
        ordem = Objects.requireNonNullElse(ordem, OrdemDaPosicao.NOME);
        situacao = situacao == null ? Set.of() : Set.copyOf(situacao);
        categorias = categorias == null ? Set.of()
                : ParametrosDaListagem.categoriasDoParametro(List.copyOf(categorias));
        if (busca != null && busca.length() > ParametrosDaListagem.TAMANHO_MAXIMO_DA_BUSCA) {
            throw new RegraDeNegocioException(MENSAGEM_BUSCA_LONGA, CAMPO_BUSCA);
        }
        Paginacao.validar(pagina, tamanho);
    }

    /** Converte os parametros crus; ausentes valem {@code ativos}, sem situacao, {@code nome}, pagina 0 e 25 itens. */
    public static ParametrosDaPosicao daRequisicao(String busca, String status, List<UUID> categorias,
            List<String> situacao, String ordem, Integer pagina, Integer tamanho) {
        return new ParametrosDaPosicao(busca, StatusFiltro.doParametro(status),
                ParametrosDaListagem.categoriasDoParametro(categorias),
                SituacaoDaPosicao.doParametro(situacao), OrdemDaPosicao.doParametro(ordem),
                Objects.requireNonNullElse(pagina, ParametrosDaListagem.PAGINA_PADRAO),
                Objects.requireNonNullElse(tamanho, ParametrosDaListagem.TAMANHO_PADRAO));
    }
}
