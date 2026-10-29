package com.geitus.app.catalog.listagem;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.shared.paginacao.Paginacao;

/**
 * Parametros de {@code GET /api/produtos} ja validados (spec de Produtos): status,
 * estoque, promocao e ordem convertidos pela allow-list, a busca dentro do teto
 * e pagina/tamanho dentro dos limites do {@link Paginacao}. Os padroes ficam SO
 * aqui. Construir um valor invalido lanca {@link RegraDeNegocioException} (400
 * com o campo), antes de chegar ao service.
 *
 * @param busca      termo digitado, como recebido ({@code null} = sem busca); o service normaliza
 * @param status     filtro de status; {@code null} vale {@link StatusFiltro#ATIVOS}
 * @param categoria  UUID publico da categoria (com as descendentes), ou {@code null}
 * @param estoque    situacoes do filtro de estoque, combinadas com OU; vazio (ou {@code null}) e sem filtro
 * @param emPromocao so produtos com promocao vigente hoje
 * @param ordem      ordenacao; {@code null} vale {@link OrdemDeProdutos#NOME}
 * @param pagina     pagina a partir de 0
 * @param tamanho    itens por pagina, de 1 a {@value Paginacao#TAMANHO_MAXIMO}
 */
public record ParametrosDaListagem(String busca, StatusFiltro status, UUID categoria, Set<EstoqueFiltro> estoque,
        boolean emPromocao, OrdemDeProdutos ordem, int pagina, int tamanho) {

    /** Pagina quando o cliente nao informa. */
    public static final int PAGINA_PADRAO = 0;
    /** Itens por pagina quando o cliente nao informa (spec de Produtos). */
    public static final int TAMANHO_PADRAO = 25;
    /** Teto do termo de busca, em caracteres. */
    public static final int TAMANHO_MAXIMO_DA_BUSCA = 200;

    static final String MENSAGEM_BUSCA_LONGA = "A busca deve ter no máximo 200 caracteres.";
    static final String CAMPO_BUSCA = "busca";
    static final String MENSAGEM_PROMOCAO_INVALIDA = "Filtro de promoção inválido.";
    static final String CAMPO_PROMOCAO = "promocao";

    private static final Boolean[] VALORES_DE_PROMOCAO = { Boolean.TRUE, Boolean.FALSE };

    public ParametrosDaListagem {
        status = Objects.requireNonNullElse(status, StatusFiltro.ATIVOS);
        ordem = Objects.requireNonNullElse(ordem, OrdemDeProdutos.NOME);
        estoque = estoque == null ? Set.of() : Set.copyOf(estoque);
        if (busca != null && busca.length() > TAMANHO_MAXIMO_DA_BUSCA) {
            throw new RegraDeNegocioException(MENSAGEM_BUSCA_LONGA, CAMPO_BUSCA);
        }
        Paginacao.validar(pagina, tamanho);
    }

    /**
     * Converte os parametros crus da requisicao. Ausentes valem o padrao:
     * {@code ativos}, sem filtro de estoque, sem promocao, ordem {@code nome},
     * pagina {@value #PAGINA_PADRAO} e tamanho {@value #TAMANHO_PADRAO}.
     */
    public static ParametrosDaListagem daRequisicao(String busca, String status, UUID categoria, List<String> estoque,
            String promocao, String ordem, Integer pagina, Integer tamanho) {
        return new ParametrosDaListagem(busca, StatusFiltro.doParametro(status), categoria,
                EstoqueFiltro.doParametro(estoque), emPromocao(promocao), OrdemDeProdutos.doParametro(ordem),
                Objects.requireNonNullElse(pagina, PAGINA_PADRAO), Objects.requireNonNullElse(tamanho, TAMANHO_PADRAO));
    }

    /** {@code true} ou {@code false}; ausente e {@code false}; qualquer outro texto, 400. */
    private static boolean emPromocao(String valor) {
        if (ParametroDaListagem.ausente(valor)) {
            return false;
        }
        return ParametroDaListagem.escolher(VALORES_DE_PROMOCAO, String::valueOf, valor,
                () -> new RegraDeNegocioException(MENSAGEM_PROMOCAO_INVALIDA, CAMPO_PROMOCAO));
    }
}
