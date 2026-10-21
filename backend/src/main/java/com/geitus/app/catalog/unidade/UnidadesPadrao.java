package com.geitus.app.catalog.unidade;

import java.util.List;

/**
 * Unidades de medida que toda empresa recebe (docs/modules/categorias-e-unidades.md,
 * secao 3.2). A migration V6 cria as mesmas para as empresas existentes; esta
 * lista atende as empresas criadas depois, via
 * {@link UnidadeMedidaService#criarPadroes}. Manter as duas fontes iguais.
 */
public final class UnidadesPadrao {

    /** Dados de uma unidade padrao. */
    public record UnidadePadrao(String sigla, String descricao, boolean fracionada) {
    }

    /** As 10 unidades padrao, na ordem da spec. */
    public static final List<UnidadePadrao> TODAS = List.of(
            new UnidadePadrao("UN", "Unidade", false),
            new UnidadePadrao("KG", "Quilograma", true),
            new UnidadePadrao("G", "Grama", true),
            new UnidadePadrao("L", "Litro", true),
            new UnidadePadrao("ML", "Mililitro", true),
            new UnidadePadrao("M", "Metro", true),
            new UnidadePadrao("CX", "Caixa", false),
            new UnidadePadrao("PCT", "Pacote", false),
            new UnidadePadrao("DZ", "Dúzia", false),
            new UnidadePadrao("FD", "Fardo", false));

    private UnidadesPadrao() {
        // Apenas constantes.
    }
}
