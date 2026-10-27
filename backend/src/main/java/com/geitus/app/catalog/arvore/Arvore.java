package com.geitus.app.catalog.arvore;

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
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Arvore de UM cadastro de UMA empresa (Categorias ou Marcas), montada em
 * memoria a partir da lista completa (docs/modules/produtos.md e
 * fornecedores-e-marcas.md — volume esperado: dezenas a poucas
 * centenas).
 *
 * <p>Objeto de dominio puro (sem Spring, sem repositorio): responde caminho,
 * nivel, selecionabilidade do ramo, subarvore, deteccao de ciclo e ordenacao.
 * E um retrato do momento em que foi montada; depois de mover/renomear,
 * monte outra.
 *
 * @param <T> o item do cadastro
 */
public final class Arvore<T extends NoDaArvore> {

    /** Separador do caminho: espaco, U+203A, espaco. */
    public static final String SEPARADOR = " › ";

    private static final Locale PORTUGUES_BRASIL = Locale.forLanguageTag("pt-BR");

    private final Map<Long, T> porId;
    private final Map<Long, List<T>> filhosPorPai;

    private Arvore(Map<Long, T> porId, Map<Long, List<T>> filhosPorPai) {
        this.porId = porId;
        this.filhosPorPai = filhosPorPai;
    }

    /** Monta a arvore a partir de todos os itens da empresa (ja persistidos, com id). */
    public static <T extends NoDaArvore> Arvore<T> de(List<T> nos) {
        Map<Long, T> porId = new LinkedHashMap<>();
        Map<Long, List<T>> filhosPorPai = new HashMap<>();
        for (T no : nos) {
            porId.put(no.getId(), no);
            filhosPorPai.computeIfAbsent(no.getPaiId(), chave -> new ArrayList<>()).add(no);
        }
        return new Arvore<>(porId, filhosPorPai);
    }

    /** Caminho completo da raiz ate o item, ex.: "Ração › Úmida › Sachê". */
    public String caminho(Long id) {
        return String.join(SEPARADOR, nomesDaRaizAte(id));
    }

    /** Profundidade do item: 0 para raiz. */
    public int nivel(Long id) {
        return linhagem(id).size() - 1;
    }

    /** Ativo e sem nenhum ancestral inativo (pode ser oferecido no seletor). */
    public boolean selecionavel(Long id) {
        return linhagem(id).stream().allMatch(NoDaArvore::isAtivo);
    }

    /**
     * Item desta arvore com o UUID publico; vazio se o UUID for nulo, de outra
     * empresa ou de item que nao existe mais.
     */
    public Optional<T> buscarPeloUuid(UUID uuid) {
        if (uuid == null) {
            return Optional.empty();
        }
        return porId.values().stream().filter(no -> uuid.equals(no.getUuid())).findFirst();
    }

    /** O proprio item e todos os seus descendentes. */
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
     * novo pai for o proprio item ou um descendente dele. Mover para a raiz
     * ({@code null}) nunca cria ciclo.
     */
    public boolean criariaCiclo(Long id, Long novoPaiId) {
        return novoPaiId != null && idsDaSubarvore(id).contains(novoPaiId);
    }

    /** Quantidade de filhos diretos. */
    public int quantidadeFilhos(Long id) {
        exigir(id);
        return filhosDe(id).size();
    }

    /**
     * Ja existe, sob {@code paiId} ({@code null} = raiz), outro item com
     * {@code nome}, sem diferenciar maiusculas? {@code ignorarId} exclui o
     * proprio item (edicao). Espelha os indices unicos de irmaos do banco.
     */
    public boolean nomeEmUsoEntreIrmaos(Long paiId, String nome, Long ignorarId) {
        String nomeComparavel = nome.trim().toLowerCase(Locale.ROOT);
        return filhosDe(paiId).stream()
                .filter(irmao -> !Objects.equals(irmao.getId(), ignorarId))
                .anyMatch(irmao -> irmao.getNome().toLowerCase(Locale.ROOT).equals(nomeComparavel));
    }

    /**
     * Todos os itens ordenados pelo caminho, comparando segmento a segmento
     * (pai antes dos filhos; irmaos em ordem alfabetica pt-BR). O
     * {@link Collator} em {@code SECONDARY} ignora maiusculas/minusculas, mas
     * NAO ignora acentos: a letra base decide primeiro ("Agua" e "Água" ficam
     * juntas, antes de "Arroz") e o acento so desempata nomes iguais na letra
     * base ("Agua" antes de "Água"). Desempate final pelo id.
     */
    public List<T> ordenadosPorCaminho() {
        Collator collator = Collator.getInstance(PORTUGUES_BRASIL);
        collator.setStrength(Collator.SECONDARY);
        Comparator<List<String>> porSegmentos = (a, b) -> compararSegmentos(collator, a, b);
        Map<Long, List<String>> segmentos = new HashMap<>();
        porId.keySet().forEach(id -> segmentos.put(id, nomesDaRaizAte(id)));
        return porId.values().stream()
                .sorted(Comparator.<T, List<String>>comparing(no -> segmentos.get(no.getId()), porSegmentos)
                        .thenComparing(NoDaArvore::getId))
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
        List<String> nomes = new ArrayList<>(linhagem(id).stream().map(NoDaArvore::getNome).toList());
        Collections.reverse(nomes);
        return nomes;
    }

    /**
     * O item seguido de seus ancestrais ate a raiz. Protegida contra dado
     * corrompido (ciclo no banco) para nunca entrar em laco infinito.
     */
    private List<T> linhagem(Long id) {
        List<T> linhagem = new ArrayList<>();
        Set<Long> visitados = new LinkedHashSet<>();
        T atual = exigir(id);
        while (atual != null) {
            if (!visitados.add(atual.getId())) {
                throw new IllegalStateException("Ciclo detectado na arvore.");
            }
            linhagem.add(atual);
            atual = atual.getPaiId() == null ? null : porId.get(atual.getPaiId());
        }
        return linhagem;
    }

    private List<T> filhosDe(Long paiId) {
        return filhosPorPai.getOrDefault(paiId, List.of());
    }

    private T exigir(Long id) {
        T no = porId.get(id);
        if (no == null) {
            throw new IllegalArgumentException("Item fora da arvore: " + id);
        }
        return no;
    }
}
