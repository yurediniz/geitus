package com.geitus.app.catalog.categoria;

import java.text.Collator;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Arvore de categorias de UMA empresa, montada em memoria a partir da lista
 * completa (docs/modules/categorias-e-unidades.md, 4.2 — volume esperado:
 * dezenas a poucas centenas).
 *
 * <p>Objeto de dominio puro (sem Spring, sem repositorio): responde caminho,
 * nivel, selecionabilidade do ramo, subarvore, deteccao de ciclo e ordenacao.
 * E um retrato do momento em que foi montada; depois de mover/renomear,
 * monte outra.
 */
public final class CategoriaArvore {

    /** Separador do caminho: espaco, U+203A, espaco. */
    public static final String SEPARADOR = " › ";

    private static final Locale PORTUGUES_BRASIL = Locale.forLanguageTag("pt-BR");

    private final Map<Long, Categoria> porId;
    private final Map<Long, List<Categoria>> filhosPorPai;

    private CategoriaArvore(Map<Long, Categoria> porId, Map<Long, List<Categoria>> filhosPorPai) {
        this.porId = porId;
        this.filhosPorPai = filhosPorPai;
    }

    /** Monta a arvore a partir de todas as categorias da empresa (ja persistidas, com id). */
    public static CategoriaArvore de(List<Categoria> categorias) {
        Map<Long, Categoria> porId = new LinkedHashMap<>();
        Map<Long, List<Categoria>> filhosPorPai = new HashMap<>();
        for (Categoria categoria : categorias) {
            porId.put(categoria.getId(), categoria);
            filhosPorPai.computeIfAbsent(categoria.getPaiId(), chave -> new ArrayList<>()).add(categoria);
        }
        return new CategoriaArvore(porId, filhosPorPai);
    }

    /** Caminho completo da raiz ate a categoria, ex.: "Ração › Úmida › Sachê". */
    public String caminho(Long id) {
        return String.join(SEPARADOR, nomesDaRaizAte(id));
    }

    /** Profundidade da categoria: 0 para raiz. */
    public int nivel(Long id) {
        return linhagem(id).size() - 1;
    }

    /** Ativa e sem nenhum ancestral inativo (pode ser oferecida no seletor do produto). */
    public boolean selecionavel(Long id) {
        return linhagem(id).stream().allMatch(Categoria::isAtivo);
    }

    /** A propria categoria e todos os seus descendentes. */
    public Set<Long> idsDaSubarvore(Long id) {
        exigir(id);
        Set<Long> ids = new LinkedHashSet<>();
        Deque<Long> pendentes = new ArrayDeque<>();
        pendentes.add(id);
        while (!pendentes.isEmpty()) {
            Long atual = pendentes.poll();
            if (ids.add(atual)) {
                filhosDe(atual).forEach(filho -> pendentes.add(filho.getId()));
            }
        }
        return ids;
    }

    /**
     * Mover {@code id} para baixo de {@code novoPaiId} criaria ciclo? Sim se o
     * novo pai for a propria categoria ou um descendente dela. Mover para a
     * raiz ({@code null}) nunca cria ciclo.
     */
    public boolean criariaCiclo(Long id, Long novoPaiId) {
        return novoPaiId != null && idsDaSubarvore(id).contains(novoPaiId);
    }

    /** Quantidade de subcategorias diretas. */
    public int quantidadeFilhos(Long id) {
        exigir(id);
        return filhosDe(id).size();
    }

    /**
     * Ja existe, sob {@code paiId} ({@code null} = raiz), outra categoria com
     * {@code nome}, sem diferenciar maiusculas? {@code ignorarId} exclui a
     * propria categoria (edicao). Espelha o indice {@code uq_categoria_irmaos}.
     */
    public boolean nomeEmUsoEntreIrmaos(Long paiId, String nome, Long ignorarId) {
        String nomeComparavel = nome.trim().toLowerCase(Locale.ROOT);
        return filhosDe(paiId).stream()
                .filter(irmao -> !Objects.equals(irmao.getId(), ignorarId))
                .anyMatch(irmao -> irmao.getNome().toLowerCase(Locale.ROOT).equals(nomeComparavel));
    }

    /**
     * Todas as categorias ordenadas pelo caminho, comparando segmento a
     * segmento (pai antes dos filhos; irmaos em ordem alfabetica pt-BR, sem
     * diferenciar maiusculas/acentos). Desempate pelo id.
     */
    public List<Categoria> ordenadasPorCaminho() {
        Collator collator = Collator.getInstance(PORTUGUES_BRASIL);
        collator.setStrength(Collator.SECONDARY);
        Comparator<List<String>> porSegmentos = (a, b) -> compararSegmentos(collator, a, b);
        Map<Long, List<String>> segmentos = new HashMap<>();
        porId.keySet().forEach(id -> segmentos.put(id, nomesDaRaizAte(id)));
        return porId.values().stream()
                .sorted(Comparator.<Categoria, List<String>>comparing(c -> segmentos.get(c.getId()), porSegmentos)
                        .thenComparing(Categoria::getId))
                .toList();
    }

    // ---------- Apoio ----------

    private static int compararSegmentos(Collator collator, List<String> a, List<String> b) {
        int limite = Math.min(a.size(), b.size());
        for (int i = 0; i < limite; i++) {
            int comparacao = collator.compare(a.get(i), b.get(i));
            if (comparacao != 0) {
                return comparacao;
            }
        }
        return Integer.compare(a.size(), b.size());
    }

    private List<String> nomesDaRaizAte(Long id) {
        List<String> nomes = new ArrayList<>(linhagem(id).stream().map(Categoria::getNome).toList());
        Collections.reverse(nomes);
        return nomes;
    }

    /**
     * A categoria seguida de seus ancestrais ate a raiz. Protegida contra dado
     * corrompido (ciclo no banco) para nunca entrar em laco infinito.
     */
    private List<Categoria> linhagem(Long id) {
        List<Categoria> linhagem = new ArrayList<>();
        Set<Long> visitados = new LinkedHashSet<>();
        Categoria atual = exigir(id);
        while (atual != null) {
            if (!visitados.add(atual.getId())) {
                throw new IllegalStateException("Ciclo detectado na arvore de categorias.");
            }
            linhagem.add(atual);
            atual = atual.getPaiId() == null ? null : porId.get(atual.getPaiId());
        }
        return linhagem;
    }

    private List<Categoria> filhosDe(Long paiId) {
        return filhosPorPai.getOrDefault(paiId, List.of());
    }

    private Categoria exigir(Long id) {
        Categoria categoria = porId.get(id);
        if (categoria == null) {
            throw new IllegalArgumentException("Categoria fora da arvore: " + id);
        }
        return categoria;
    }
}
