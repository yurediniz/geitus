package com.geitus.app.catalog.arvore;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

/**
 * Testa a {@link Arvore} generica, usada por Categorias e Marcas
 * (docs/modules/fornecedores-e-marcas.md), com um no de teste simples,
 * sem JPA.
 *
 * <p>Arvore usada nos testes:
 * <pre>
 * Boehringer (1)
 * ├── Nexgard (2)
 * │   └── Nexgard Combo (3)
 * └── Frontline (4)
 * Golden (5)
 * </pre>
 */
class ArvoreTest {

    /** No minimo da arvore, so para o teste. */
    private record No(Long id, Long paiId, String nome, boolean ativo, UUID uuid) implements NoDaArvore {

        No(Long id, Long paiId, String nome) {
            this(id, paiId, nome, true, UUID.randomUUID());
        }

        No inativo() {
            return new No(id, paiId, nome, false, uuid);
        }

        @Override
        public Long getId() {
            return id;
        }

        @Override
        public Long getPaiId() {
            return paiId;
        }

        @Override
        public String getNome() {
            return nome;
        }

        @Override
        public boolean isAtivo() {
            return ativo;
        }

        @Override
        public UUID getUuid() {
            return uuid;
        }
    }

    private static final No BOEHRINGER = new No(1L, null, "Boehringer");
    private static final No NEXGARD = new No(2L, 1L, "Nexgard");
    private static final No COMBO = new No(3L, 2L, "Nexgard Combo");
    private static final No FRONTLINE = new No(4L, 1L, "Frontline");
    private static final No GOLDEN = new No(5L, null, "Golden");

    private static Arvore<No> arvore(No... extras) {
        List<No> nos = new ArrayList<>(List.of(BOEHRINGER, NEXGARD, COMBO, FRONTLINE, GOLDEN));
        for (No extra : extras) {
            nos.removeIf(no -> no.getId().equals(extra.getId()));
            nos.add(extra);
        }
        return Arvore.de(nos);
    }

    @Test
    void caminhoComOSeparadorEONivel() {
        Arvore<No> arvore = arvore();

        assertThat(arvore.caminho(3L)).isEqualTo("Boehringer › Nexgard › Nexgard Combo");
        assertThat(arvore.caminho(5L)).isEqualTo("Golden");
        assertThat(arvore.nivel(1L)).isZero();
        assertThat(arvore.nivel(3L)).isEqualTo(2);
    }

    @Test
    void cicloAoMoverParaSiMesmoOuParaUmDescendente() {
        Arvore<No> arvore = arvore();

        assertThat(arvore.criariaCiclo(2L, 2L)).isTrue();
        assertThat(arvore.criariaCiclo(1L, 3L)).isTrue();
        assertThat(arvore.criariaCiclo(2L, 4L)).isFalse();
        assertThat(arvore.criariaCiclo(3L, null)).isFalse();
    }

    @Test
    void subarvoreTemOProprioNoEOsDescendentes() {
        Arvore<No> arvore = arvore();

        assertThat(arvore.idsDaSubarvore(1L)).containsExactlyInAnyOrder(1L, 2L, 3L, 4L);
        assertThat(arvore.idsDaSubarvore(2L)).containsExactlyInAnyOrder(2L, 3L);
        assertThat(arvore.idsDaSubarvore(3L)).containsExactly(3L);
    }

    @Test
    void nomeEntreIrmaosSemDiferenciarMaiusculas() {
        Arvore<No> arvore = arvore();

        assertThat(arvore.nomeEmUsoEntreIrmaos(1L, "NEXGARD", null)).isTrue();
        assertThat(arvore.nomeEmUsoEntreIrmaos(null, " golden ", null)).isTrue();
        assertThat(arvore.nomeEmUsoEntreIrmaos(2L, "Frontline", null)).isFalse();
        assertThat(arvore.nomeEmUsoEntreIrmaos(1L, "nexgard", 2L)).isFalse();
    }

    @Test
    void naoSelecionavelComAncestralInativo() {
        Arvore<No> arvore = arvore(NEXGARD.inativo());

        assertThat(arvore.selecionavel(2L)).isFalse();
        assertThat(arvore.selecionavel(3L)).isFalse();
        assertThat(arvore.selecionavel(1L)).isTrue();
        assertThat(arvore.selecionavel(4L)).isTrue();
    }

    @Test
    void quantidadeDeFilhosDiretos() {
        Arvore<No> arvore = arvore();

        assertThat(arvore.quantidadeFilhos(1L)).isEqualTo(2);
        assertThat(arvore.quantidadeFilhos(3L)).isZero();
    }

    @Test
    void buscaPeloUuidSoDentroDaArvore() {
        Arvore<No> arvore = arvore();

        assertThat(arvore.buscarPeloUuid(COMBO.getUuid())).containsSame(COMBO);
        assertThat(arvore.buscarPeloUuid(UUID.randomUUID())).isEmpty();
        assertThat(arvore.buscarPeloUuid(null)).isEmpty();
    }

    @Test
    void ordenadosPeloCaminhoComOPaiAntesDosFilhos() {
        assertThat(arvore().ordenadosPorCaminho())
                .extracting(No::getNome)
                .containsExactly("Boehringer", "Frontline", "Nexgard", "Nexgard Combo", "Golden");
    }

    @Test
    void noForaDaArvoreLancaExcecao() {
        assertThatThrownBy(() -> arvore().caminho(99L)).isInstanceOf(IllegalArgumentException.class);
    }
}
