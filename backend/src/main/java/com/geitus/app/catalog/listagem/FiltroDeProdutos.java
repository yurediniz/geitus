package com.geitus.app.catalog.listagem;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import com.geitus.app.shared.busca.TextoDeBusca;

/**
 * Filtros ja resolvidos da listagem (spec 4.1 e 4.2), todos combinados com E.
 *
 * @param empresaId     empresa do usuario autenticado (DEC-016), obrigatoria
 * @param palavras      palavras normalizadas do termo ({@link TextoDeBusca#palavras}); vazia = sem busca por texto
 * @param termoDeCodigo termo sem espacos comparado com os codigos de barras, ou {@code null}
 * @param termoNumerico termo so de digitos, sem zeros a esquerda ({@link TextoDeBusca#termoNumerico}),
 *                      comparado com o numero e o codigo do produto, ou {@code null}
 * @param status        filtro de status, obrigatorio
 * @param categoriaIds  categoria e descendentes; {@code null} = sem filtro, vazio = lista vazia
 * @param estoque       filtro de estoque, ou {@code null}
 * @param emPromocao    so produtos com promocao vigente em {@code hoje}
 * @param hoje          data de referencia da promocao (relogio de Sao Paulo), obrigatoria
 */
public record FiltroDeProdutos(Long empresaId, List<String> palavras, String termoDeCodigo, Long termoNumerico,
        StatusFiltro status, Set<Long> categoriaIds, EstoqueFiltro estoque, boolean emPromocao, LocalDate hoje) {

    public FiltroDeProdutos {
        Objects.requireNonNull(empresaId, "empresaId");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(hoje, "hoje");
        palavras = palavras == null ? List.of() : List.copyOf(palavras);
        if (palavras.size() > TextoDeBusca.MAXIMO_DE_PALAVRAS) {
            throw new IllegalArgumentException("No maximo " + TextoDeBusca.MAXIMO_DE_PALAVRAS + " palavras.");
        }
        categoriaIds = categoriaIds == null ? null : Set.copyOf(categoriaIds);
    }

    /** Ha termo de busca (por texto, por codigo de barras, por numero ou codigo do produto). */
    boolean temBusca() {
        return !palavras.isEmpty() || termoDeCodigo != null || termoNumerico != null;
    }

    /** O filtro de categoria nao casa com nenhum produto (categoria inexistente ou de outra empresa). */
    boolean semCategoriaPossivel() {
        return categoriaIds != null && categoriaIds.isEmpty();
    }
}
