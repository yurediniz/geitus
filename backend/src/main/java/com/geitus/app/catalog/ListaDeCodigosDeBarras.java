package com.geitus.app.catalog;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Reconciliacao de uma lista de {@link ProdutoCodigoBarras} (a da unidade de
 * venda ou a de uma embalagem) pelo texto do codigo, comum ao {@link Produto}
 * e a {@link ProdutoEmbalagem}.
 *
 * <p>Um codigo mantido continua sendo a MESMA linha (so a ordem muda e o
 * formato gravado e preservado); os ausentes saem da lista e sao apagados
 * ({@code orphanRemoval}); so os novos sao criados. Recriar a linha de um
 * codigo mantido violaria {@code uq_codigo_barras_empresa}, porque no flush o
 * Hibernate insere antes de apagar os orfaos.
 */
final class ListaDeCodigosDeBarras {

    /** Cria a linha de um codigo novo na posicao informada. */
    @FunctionalInterface
    interface FabricaDeCodigo {
        ProdutoCodigoBarras criar(CodigoBarrasValidado codigo, int ordem);
    }

    private ListaDeCodigosDeBarras() {
        // Apenas metodos estaticos.
    }

    /** Substitui {@code atuais} pela lista informada, na ordem (o primeiro e o principal). */
    static void substituir(List<ProdutoCodigoBarras> atuais, List<CodigoBarrasValidado> informados,
            FabricaDeCodigo novo) {
        List<ProdutoCodigoBarras> reconciliados = new ArrayList<>(informados.size());
        for (int ordem = 0; ordem < informados.size(); ordem++) {
            CodigoBarrasValidado informado = informados.get(ordem);
            Optional<ProdutoCodigoBarras> gravado = comTexto(atuais, informado.codigo());
            if (gravado.isPresent()) {
                gravado.get().posicionarEm(ordem);
                reconciliados.add(gravado.get());
            } else {
                reconciliados.add(novo.criar(informado, ordem));
            }
        }
        atuais.clear();
        atuais.addAll(reconciliados);
    }

    /**
     * Tira da lista os codigos fora de {@code mantidos} (apagados no proximo
     * flush). Primeira fase de um salvamento em que um codigo pode mudar de
     * lista: a linha antiga precisa sair do banco antes de a nova entrar.
     */
    static void removerForaDe(List<ProdutoCodigoBarras> atuais, Set<String> mantidos) {
        atuais.removeIf(codigo -> !mantidos.contains(codigo.getCodigo()));
    }

    static Optional<ProdutoCodigoBarras> comTexto(List<ProdutoCodigoBarras> atuais, String codigo) {
        return atuais.stream()
                .filter(codigoDaLista -> codigoDaLista.getCodigo().equals(codigo))
                .findFirst();
    }

    static List<String> textos(List<ProdutoCodigoBarras> atuais) {
        return atuais.stream().map(ProdutoCodigoBarras::getCodigo).toList();
    }
}
