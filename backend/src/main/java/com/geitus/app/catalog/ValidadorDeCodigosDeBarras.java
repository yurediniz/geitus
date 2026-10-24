package com.geitus.app.catalog;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.IntFunction;

import org.springframework.stereotype.Component;

/**
 * Regras de uma lista de codigos de barras
 * (docs/modules/produtos-identificacao-e-formulario.md, 4.3), usadas pela
 * lista da unidade de venda e pela de cada embalagem
 * (docs/modules/produtos-embalagens.md, 2.1). O limite, a mensagem do limite
 * e o campo do erro vem de quem chama.
 *
 * <p>A unicidade e conferida dentro da empresa (DEC-016): o nome devolvido na
 * mensagem de conflito e sempre de um produto da mesma empresa.
 */
@Component
public class ValidadorDeCodigosDeBarras {

    static final String MENSAGEM_CODIGO_REPETIDO = "Código de barras repetido na lista.";
    static final String MENSAGEM_CODIGO_LONGO = "Código de barras deve ter no máximo 50 caracteres.";
    static final String MENSAGEM_DIGITO_INVALIDO = "Código de barras %s com dígito verificador inválido. "
            + "Confira a leitura.";
    static final int TAMANHO_MAXIMO_CODIGO = 50;

    private final ProdutoRepository produtoRepository;

    public ValidadorDeCodigosDeBarras(ProdutoRepository produtoRepository) {
        this.produtoRepository = produtoRepository;
    }

    /**
     * Valida a lista, nesta ordem: normaliza (descartando vazios) → repetidos
     * no envio (400) → mais que {@code limite} (400 com {@code mensagemDoLimite})
     * → para cada codigo: se o produto ja o tem ({@code gravadosNoProduto},
     * codigo → formato gravado), mantem o formato gravado (inclusive
     * {@code OUTRO} de um EAN com digito errado vindo da migracao); senao
     * detecta o formato, recusa candidato GS1 com digito invalido (400) e
     * confere a unicidade na empresa fora do produto atual (409).
     * {@code produtoAtualId} e {@code null} no cadastro. Todo erro aponta
     * {@code campo}.
     */
    public List<CodigoBarrasValidado> validar(Long empresaId, List<String> informados, int limite,
            String mensagemDoLimite, String campo, Map<String, FormatoCodigoBarras> gravadosNoProduto,
            Long produtoAtualId) {
        List<String> codigos = normalizar(informados);
        exigirSemRepetidos(codigos, campo);
        if (codigos.size() > limite) {
            throw new RegraDeNegocioException(mensagemDoLimite, campo);
        }
        List<CodigoBarrasValidado> validados = new ArrayList<>(codigos.size());
        for (String codigo : codigos) {
            FormatoCodigoBarras gravado = gravadosNoProduto.get(codigo);
            validados.add(gravado != null
                    ? new CodigoBarrasValidado(codigo, gravado)
                    : codigoNovoValidado(empresaId, codigo, campo, produtoAtualId));
        }
        return validados;
    }

    /**
     * O mesmo codigo nao pode estar em duas listas do produto (a da unidade e
     * as das embalagens): 400 no campo da lista da segunda ocorrencia,
     * {@code campoDaLista.apply(indiceDaLista)}. Cada lista e normalizada como
     * em {@link #validar}.
     */
    public void exigirSemRepetidosEntreListas(List<List<String>> listas, IntFunction<String> campoDaLista) {
        Set<String> vistos = new HashSet<>();
        for (int indice = 0; indice < listas.size(); indice++) {
            for (String codigo : new HashSet<>(normalizar(listas.get(indice)))) {
                if (!vistos.add(codigo)) {
                    throw new RegraDeNegocioException(MENSAGEM_CODIGO_REPETIDO, campoDaLista.apply(indice));
                }
            }
        }
    }

    /** Lista normalizada: {@code null} vira vazia e codigos vazios/so espacos sao descartados. */
    public static List<String> normalizar(List<String> informados) {
        if (informados == null) {
            return List.of();
        }
        return informados.stream()
                .map(CodigoBarras::normalizar)
                .filter(Objects::nonNull)
                .toList();
    }

    private static void exigirSemRepetidos(List<String> codigos, String campo) {
        Set<String> vistos = new HashSet<>();
        for (String codigo : codigos) {
            if (!vistos.add(codigo)) {
                throw new RegraDeNegocioException(MENSAGEM_CODIGO_REPETIDO, campo);
            }
        }
    }

    private CodigoBarrasValidado codigoNovoValidado(Long empresaId, String codigo, String campo,
            Long produtoAtualId) {
        if (codigo.length() > TAMANHO_MAXIMO_CODIGO) {
            throw new RegraDeNegocioException(MENSAGEM_CODIGO_LONGO, campo);
        }
        if (CodigoBarras.ehCandidatoGs1(codigo) && !CodigoBarras.digitoVerificadorValido(codigo)) {
            throw new RegraDeNegocioException(MENSAGEM_DIGITO_INVALIDO.formatted(codigo), campo);
        }
        produtoRepository.produtoComCodigo(empresaId, codigo, produtoAtualId).ifPresent(nomeDoProduto -> {
            throw new ProdutoConflitoException(mensagemDoConflito(empresaId, codigo, nomeDoProduto, produtoAtualId),
                    campo);
        });
        return new CodigoBarrasValidado(codigo, CodigoBarras.detectarFormato(codigo));
    }

    /**
     * Com o codigo numa embalagem de outro produto, a mensagem traz o rotulo da
     * embalagem (Fase B3, 2.3); na unidade, a mensagem de antes. So consulta o
     * dono no caminho do conflito.
     */
    private String mensagemDoConflito(Long empresaId, String codigo, String nomeDoProduto, Long produtoAtualId) {
        return produtoRepository.codigosEmUso(empresaId, List.of(codigo), produtoAtualId).stream()
                .findFirst()
                .map(CodigoDeBarrasEmUso::mensagem)
                .orElseGet(() -> CodigoDeBarrasEmUso.mensagemNoProduto(codigo, nomeDoProduto));
    }
}
