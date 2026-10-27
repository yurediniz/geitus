package com.geitus.app.catalog.categoria;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.company.Empresa;

/**
 * Testa o objeto de dominio puro {@link CategoriaArvore} (sem Spring e sem
 * mocks): caminho, nivel, subarvore, deteccao de ciclo, selecionabilidade do
 * ramo e ordenacao pelo caminho (docs/modules/produtos.md).
 *
 * <p>Arvore usada nos testes:
 * <pre>
 * Ração (1)
 * ├── Úmida (2)
 * │   └── Sachê (3)
 * └── Seca (4)
 * Bebidas (5)
 * </pre>
 */
class CategoriaArvoreTest {

    private static final Long ID_EMPRESA = 7L;

    private final List<Categoria> categorias = new ArrayList<>();
    private Empresa empresa;
    private Categoria racao;
    private Categoria umida;
    private Categoria sache;
    private Categoria seca;
    private Categoria bebidas;

    @BeforeEach
    void montarArvore() {
        empresa = new Empresa("Empresa");
        ReflectionTestUtils.setField(empresa, "id", ID_EMPRESA);
        racao = categoria(1L, null, "Ração");
        umida = categoria(2L, racao, "Úmida");
        sache = categoria(3L, umida, "Sachê");
        seca = categoria(4L, racao, "Seca");
        bebidas = categoria(5L, null, "Bebidas");
    }

    private Categoria categoria(Long id, Categoria pai, String nome) {
        Categoria categoria = new Categoria(empresa, pai, nome);
        ReflectionTestUtils.setField(categoria, "id", id);
        categorias.add(categoria);
        return categoria;
    }

    private CategoriaArvore arvore() {
        return CategoriaArvore.de(categorias);
    }

    @Test
    void buscarPeloUuidSoAchaCategoriaDaArvore() {
        CategoriaArvore arvore = arvore();

        assertThat(arvore.buscarPeloUuid(umida.getUuid())).containsSame(umida);
        assertThat(arvore.buscarPeloUuid(UUID.randomUUID())).isEmpty();
        assertThat(arvore.buscarPeloUuid(null)).isEmpty();
    }

    @Test
    void caminhoEmTresNiveis() {
        assertThat(arvore().caminho(sache.getId())).isEqualTo("Ração › Úmida › Sachê");
        assertThat(arvore().caminho(bebidas.getId())).isEqualTo("Bebidas");
    }

    @Test
    void nivelDaRaizEZero() {
        CategoriaArvore arvore = arvore();

        assertThat(arvore.nivel(racao.getId())).isZero();
        assertThat(arvore.nivel(umida.getId())).isEqualTo(1);
        assertThat(arvore.nivel(sache.getId())).isEqualTo(2);
    }

    @Test
    void subarvoreDaRaizIncluiTodosOsDescendentes() {
        assertThat(arvore().idsDaSubarvore(racao.getId())).containsExactlyInAnyOrder(1L, 2L, 3L, 4L);
    }

    @Test
    void subarvoreDoMeioIncluiSoOsDescendentes() {
        // Nem o pai (Ração) nem o irmao (Seca) entram.
        assertThat(arvore().idsDaSubarvore(umida.getId()))
                .containsExactlyInAnyOrder(umida.getId(), sache.getId());
    }

    @Test
    void subarvoreDaFolhaESoElaMesma() {
        assertThat(arvore().idsDaSubarvore(sache.getId())).containsExactly(3L);
    }

    @Test
    void moverParaSiMesmaCriaCiclo() {
        assertThat(arvore().criariaCiclo(umida.getId(), umida.getId())).isTrue();
    }

    @Test
    void moverParaNetoCriaCiclo() {
        assertThat(arvore().criariaCiclo(racao.getId(), sache.getId())).isTrue();
    }

    @Test
    void moverParaIrmaoNaoCriaCiclo() {
        assertThat(arvore().criariaCiclo(umida.getId(), seca.getId())).isFalse();
    }

    @Test
    void moverParaRaizNaoCriaCiclo() {
        assertThat(arvore().criariaCiclo(sache.getId(), null)).isFalse();
    }

    @Test
    void moverParaOutroRamoNaoCriaCiclo() {
        assertThat(arvore().criariaCiclo(racao.getId(), bebidas.getId())).isFalse();
    }

    @Test
    void ramoSobAncestralInativoNaoESelecionavel() {
        umida.inativar();
        CategoriaArvore arvore = arvore();

        assertThat(arvore.selecionavel(umida.getId())).isFalse();
        assertThat(arvore.selecionavel(sache.getId())).isFalse();
        assertThat(arvore.selecionavel(racao.getId())).isTrue();
        assertThat(arvore.selecionavel(seca.getId())).isTrue();
    }

    @Test
    void reativarDevolveORamoAoSeletor() {
        umida.inativar();
        umida.ativar();

        assertThat(arvore().selecionavel(sache.getId())).isTrue();
    }

    @Test
    void avoInativadoEReativadoAlternaSelecionavelDoNeto() {
        racao.inativar();
        assertThat(arvore().selecionavel(sache.getId())).isFalse();

        racao.ativar();
        assertThat(arvore().selecionavel(sache.getId())).isTrue();
    }

    @Test
    void ordenadasPorCaminho() {
        assertThat(arvore().ordenadasPorCaminho())
                .extracting(Categoria::getNome)
                .containsExactly("Bebidas", "Ração", "Seca", "Úmida", "Sachê")
                .hasSize(5);
        assertThat(arvore().ordenadasPorCaminho())
                .extracting(c -> arvore().caminho(c.getId()))
                .containsExactly("Bebidas", "Ração", "Ração › Seca", "Ração › Úmida", "Ração › Úmida › Sachê");
    }

    @Test
    void ordenacaoMantemFilhosLogoAposOPaiMesmoComIrmaoDeNomeParecido() {
        // Comparacao por segmento: "Ração Premium" (raiz) nao pode se intrometer
        // entre "Ração" e seus filhos, como aconteceria comparando o texto
        // inteiro do caminho (o separador " › " ordena depois do espaco).
        categoria(6L, null, "Ração Premium");

        assertThat(arvore().ordenadasPorCaminho())
                .extracting(Categoria::getNome)
                .containsExactly("Bebidas", "Ração", "Seca", "Úmida", "Sachê", "Ração Premium");
    }

    @Test
    void ordenacaoIgnoraMaiusculasEAcentos() {
        categoria(6L, null, "água");
        categoria(7L, null, "Azeite");

        assertThat(arvore().ordenadasPorCaminho())
                .extracting(Categoria::getNome)
                .startsWith("água", "Azeite", "Bebidas");
    }

    @Test
    void quantidadeFilhosContaSoOsDiretos() {
        CategoriaArvore arvore = arvore();

        assertThat(arvore.quantidadeFilhos(racao.getId())).isEqualTo(2);
        assertThat(arvore.quantidadeFilhos(umida.getId())).isEqualTo(1);
        assertThat(arvore.quantidadeFilhos(sache.getId())).isZero();
    }

    @Test
    void nomeEmUsoEntreIrmaosSemDiferenciarMaiusculas() {
        CategoriaArvore arvore = arvore();

        assertThat(arvore.nomeEmUsoEntreIrmaos(racao.getId(), "SECA", null)).isTrue();
        assertThat(arvore.nomeEmUsoEntreIrmaos(null, "bebidas", null)).isTrue();
        assertThat(arvore.nomeEmUsoEntreIrmaos(umida.getId(), "Seca", null)).isFalse();
    }

    @Test
    void nomeEmUsoEntreIrmaosIgnoraAPropriaCategoria() {
        assertThat(arvore().nomeEmUsoEntreIrmaos(racao.getId(), "seca", seca.getId())).isFalse();
    }

    @Test
    void categoriaDesconhecidaLancaExcecao() {
        assertThatThrownBy(() -> arvore().caminho(99L)).isInstanceOf(IllegalArgumentException.class);
    }
}
