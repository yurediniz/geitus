package com.geitus.app.catalog.categoria;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.geitus.app.catalog.arvore.Arvore;

/**
 * Arvore de categorias de UMA empresa (docs/modules/produtos.md).
 * Fachada tipada sobre a {@link Arvore} generica, que tambem serve as
 * Marcas: as regras (caminho, nivel, ramo selecionavel, subarvore, ciclo,
 * nome entre irmaos e ordenacao) vivem la.
 *
 * <p>E um retrato do momento em que foi montada; depois de mover/renomear,
 * monte outra.
 */
public final class CategoriaArvore {

    /** Separador do caminho: espaco, U+203A, espaco. */
    public static final String SEPARADOR = Arvore.SEPARADOR;

    private final Arvore<Categoria> arvore;

    private CategoriaArvore(Arvore<Categoria> arvore) {
        this.arvore = arvore;
    }

    /** Monta a arvore a partir de todas as categorias da empresa (ja persistidas, com id). */
    public static CategoriaArvore de(List<Categoria> categorias) {
        return new CategoriaArvore(Arvore.de(categorias));
    }

    /** Caminho completo da raiz ate a categoria, ex.: "Ração › Úmida › Sachê". */
    public String caminho(Long id) {
        return arvore.caminho(id);
    }

    /** Profundidade da categoria: 0 para raiz. */
    public int nivel(Long id) {
        return arvore.nivel(id);
    }

    /** Ativa e sem nenhum ancestral inativo (pode ser oferecida no seletor do produto). */
    public boolean selecionavel(Long id) {
        return arvore.selecionavel(id);
    }

    /** Categoria desta arvore com o UUID publico; vazio se nulo, de outra empresa ou inexistente. */
    public Optional<Categoria> buscarPeloUuid(UUID uuid) {
        return arvore.buscarPeloUuid(uuid);
    }

    /** A propria categoria e todos os seus descendentes. */
    public Set<Long> idsDaSubarvore(Long id) {
        return arvore.idsDaSubarvore(id);
    }

    /**
     * Ids do filtro "categoria com descendentes" das listagens: {@code null} sem
     * filtro; categoria fora desta arvore (de outra empresa ou excluida) vira
     * conjunto vazio, que da lista vazia sem revelar nada.
     */
    public Set<Long> idsDoFiltro(UUID categoria) {
        if (categoria == null) {
            return null;
        }
        return buscarPeloUuid(categoria)
                .map(encontrada -> idsDaSubarvore(encontrada.getId()))
                .orElse(Set.of());
    }

    /** Mover {@code id} para baixo de {@code novoPaiId} criaria ciclo? */
    public boolean criariaCiclo(Long id, Long novoPaiId) {
        return arvore.criariaCiclo(id, novoPaiId);
    }

    /** Quantidade de subcategorias diretas. */
    public int quantidadeFilhos(Long id) {
        return arvore.quantidadeFilhos(id);
    }

    /** Outra categoria com {@code nome} sob {@code paiId}, sem diferenciar maiusculas? */
    public boolean nomeEmUsoEntreIrmaos(Long paiId, String nome, Long ignorarId) {
        return arvore.nomeEmUsoEntreIrmaos(paiId, nome, ignorarId);
    }

    /** Todas as categorias ordenadas pelo caminho (pai antes dos filhos). */
    public List<Categoria> ordenadasPorCaminho() {
        return arvore.ordenadosPorCaminho();
    }
}
