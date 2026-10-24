package com.geitus.app.catalog;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.geitus.app.catalog.PlanoDeEmbalagens.EmbalagemPlanejada;
import com.geitus.app.catalog.PlanoDeEmbalagens.EmbalagemRemovida;
import com.geitus.app.catalog.dto.EmbalagemRequest;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;

/**
 * Regras e reconciliacao das embalagens do produto
 * (docs/modules/produtos-embalagens.md, 2, 3.3 e 7; DEC-037), fora do
 * {@code ProdutoService} para nao engorda-lo.
 *
 * <p>{@link #planejar} valida a lista inteira antes de qualquer gravacao e
 * reconcilia pelo {@code id} (UUID publico): embalagem sem {@code id} e nova,
 * ausente da lista e removida, e um {@code id} que nao e deste produto da 404
 * (DEC-016). A ordem das regras de cada embalagem e a do plano da Fase B3: a
 * primeira que falha responde, com o campo indexado {@code embalagens[j].campo}.
 *
 * <p>A aplicacao e em duas fases, com um {@code flush} entre elas feito por
 * quem chama: {@link #aplicarRemocoes} tira as embalagens removidas, os codigos
 * que saem de cada lista e a marca "de compra" que muda de embalagem;
 * {@link #aplicarInclusoes} grava o resto. Assim um codigo que muda de lista
 * (da unidade para uma embalagem, entre embalagens, de uma embalagem removida
 * para uma nova) nunca viola {@code uq_codigo_barras_empresa}: o Hibernate
 * insere antes de apagar (Review Focus 1). A troca de unidade e quantidade
 * entre embalagens e coberta pela unicidade adiavel da V12 (Review Focus 2).
 */
@Component
public class EmbalagensDoProduto {

    static final int MAXIMO_DE_EMBALAGENS = 10;
    static final int MAXIMO_CODIGOS_POR_EMBALAGEM = 5;
    static final String CAMPO_EMBALAGENS = "embalagens";
    static final String CAMPO_CODIGOS_DA_UNIDADE = "codigosBarras";

    static final String MENSAGEM_LIMITE_DE_EMBALAGENS = "Informe no máximo 10 embalagens.";
    static final String MENSAGEM_LIMITE_DE_CODIGOS = "Informe no máximo 5 códigos de barras por embalagem.";
    static final String MENSAGEM_NAO_ENCONTRADA = "Embalagem não encontrada.";
    static final String MENSAGEM_UNIDADE_OBRIGATORIA = "Informe a unidade da embalagem.";
    static final String MENSAGEM_UNIDADE_INATIVA = "Esta unidade está inativa. Escolha uma unidade ativa.";
    static final String MENSAGEM_UNIDADE_DE_VENDA =
            "A embalagem precisa de uma unidade diferente da unidade de venda (%s).";
    static final String MENSAGEM_QUANTIDADE_OBRIGATORIA = "Informe a quantidade da embalagem.";
    static final String MENSAGEM_QUANTIDADE_ATE_UM = "A embalagem precisa conter mais de 1 %s.";
    static final String MENSAGEM_QUANTIDADE_LIMITE =
            "A quantidade da embalagem deve ter no máximo 9 dígitos inteiros e 3 casas decimais.";
    static final String MENSAGEM_SEM_FRACAO = "%s não aceita quantidade fracionada. Informe um número inteiro.";
    static final String MENSAGEM_REPETIDA = "Já existe a embalagem %s neste produto.";
    static final String MENSAGEM_DUAS_DE_COMPRA = "Só uma embalagem pode ser a de compra.";
    static final String MENSAGEM_PRECO_NAO_POSITIVO = "O preço da embalagem deve ser maior que zero.";
    static final String MENSAGEM_ABAIXO_DO_MINIMO =
            "O preço da embalagem dá %s por %s, abaixo do preço mínimo (%s).";

    private static final int CASAS_DA_QUANTIDADE = QuantidadeDeEstoque.CASAS_DECIMAIS;
    private static final int CASAS_DO_REAL = 2;
    private static final Locale PORTUGUES_DO_BRASIL = Locale.forLanguageTag("pt-BR");

    private final UnidadeMedidaService unidadeService;
    private final ValidadorDeCodigosDeBarras validadorDeCodigos;

    public EmbalagensDoProduto(UnidadeMedidaService unidadeService, ValidadorDeCodigosDeBarras validadorDeCodigos) {
        this.unidadeService = unidadeService;
        this.validadorDeCodigos = validadorDeCodigos;
    }

    /**
     * Valida e reconcilia a lista de embalagens do salvamento, sem alterar o
     * produto.
     *
     * @param produtoAtual o produto na edicao, ou {@code null} no cadastro
     * @param unidadeDeVenda a unidade de venda depois do salvamento (pode ter mudado)
     * @param precoMinimo o preco minimo depois do salvamento, ou {@code null}
     * @param informadas a lista completa; {@code null} (campo ausente no PATCH)
     *        mantem as atuais, que sao conferidas de novo contra a unidade de
     *        venda e o preco minimo (Review Focus 3)
     * @param codigosDaUnidade os codigos da unidade de venda depois do salvamento,
     *        para recusar o mesmo codigo na unidade e numa embalagem
     */
    public PlanoDeEmbalagens planejar(Long empresaId, Produto produtoAtual, UnidadeMedida unidadeDeVenda,
            BigDecimal precoMinimo, List<EmbalagemRequest> informadas, List<String> codigosDaUnidade) {
        boolean listaInformada = informadas != null;
        List<EmbalagemRequest> lista = listaInformada ? informadas : comoInformadas(produtoAtual);
        if (lista.isEmpty() && semEmbalagens(produtoAtual)) {
            return PlanoDeEmbalagens.VAZIO;
        }
        if (lista.size() > MAXIMO_DE_EMBALAGENS) {
            throw new RegraDeNegocioException(MENSAGEM_LIMITE_DE_EMBALAGENS, CAMPO_EMBALAGENS);
        }
        Map<UUID, ProdutoEmbalagem> naoReconciliadas = porUuid(produtoAtual);
        List<ProdutoEmbalagem> existentes = new ArrayList<>(lista.size());
        List<DadosEmbalagem> dados = new ArrayList<>(lista.size());
        RegrasDaLista regras = new RegrasDaLista(unidadeDeVenda);
        for (int indice = 0; indice < lista.size(); indice++) {
            EmbalagemRequest informada = lista.get(indice);
            ProdutoEmbalagem existente = reconciliar(informada.id(), naoReconciliadas);
            existentes.add(existente);
            dados.add(validarEmbalagem(empresaId, informada, existente, precoMinimo, regras, indice));
        }
        List<List<CodigoBarrasValidado>> codigos = validarCodigos(empresaId, produtoAtual, lista, codigosDaUnidade,
                listaInformada);
        return new PlanoDeEmbalagens(planejadas(existentes, dados, codigos, unidadeDeVenda),
                removidas(naoReconciliadas));
    }

    /**
     * Fase 1: tira as embalagens removidas, os codigos que saem de cada
     * embalagem mantida e a marca "de compra" que vai para outra embalagem.
     * Quem chama faz o {@code flush} antes da fase 2.
     */
    public void aplicarRemocoes(Produto produto, PlanoDeEmbalagens plano) {
        produto.removerEmbalagens(plano.removidas().stream().map(EmbalagemRemovida::embalagem).toList());
        for (EmbalagemPlanejada planejada : plano.embalagens()) {
            ProdutoEmbalagem existente = planejada.existente();
            if (existente == null) {
                continue;
            }
            existente.removerCodigosForaDe(textos(planejada.codigos()));
            if (existente.isDeCompra() && !planejada.dados().deCompra()) {
                existente.desmarcarDeCompra();
            }
        }
    }

    /** Fase 2: atualiza as mantidas, cria as novas e grava a lista final na ordem enviada. */
    public void aplicarInclusoes(Produto produto, PlanoDeEmbalagens plano) {
        List<ProdutoEmbalagem> finais = new ArrayList<>(plano.embalagens().size());
        for (EmbalagemPlanejada planejada : plano.embalagens()) {
            ProdutoEmbalagem embalagem = planejada.existente();
            if (embalagem == null) {
                embalagem = new ProdutoEmbalagem(produto, planejada.dados());
            } else {
                embalagem.atualizar(planejada.dados());
            }
            embalagem.substituirCodigos(planejada.codigos());
            finais.add(embalagem);
        }
        produto.substituirEmbalagens(finais);
    }

    /** Campo indexado de uma embalagem na API, ex.: {@code embalagens[1].quantidade}. */
    static String campo(int indice, String nome) {
        return CAMPO_EMBALAGENS + "[" + indice + "]." + nome;
    }

    // ---------- Regras de cada embalagem ----------

    /** Unidades e "de compra" ja vistos na lista, para as regras que comparam embalagens. */
    private static final class RegrasDaLista {

        private final UnidadeMedida unidadeDeVenda;
        private final Set<String> unidadesEQuantidades = new HashSet<>();
        private boolean temDeCompra;

        private RegrasDaLista(UnidadeMedida unidadeDeVenda) {
            this.unidadeDeVenda = unidadeDeVenda;
        }
    }

    /** Ordem: unidade → quantidade &gt; 1 → fracao → repetida → de compra unica → preco (os codigos vem depois). */
    private DadosEmbalagem validarEmbalagem(Long empresaId, EmbalagemRequest informada, ProdutoEmbalagem existente,
            BigDecimal precoMinimo, RegrasDaLista regras, int indice) {
        UnidadeMedida unidade = validarUnidade(empresaId, informada.unidadeId(), existente, regras.unidadeDeVenda,
                indice);
        BigDecimal quantidade = validarQuantidade(informada.quantidade(), regras.unidadeDeVenda, indice);
        String chave = unidade.getId() + "/" + quantidade.stripTrailingZeros().toPlainString();
        if (!regras.unidadesEQuantidades.add(chave)) {
            throw new RegraDeNegocioException(MENSAGEM_REPETIDA.formatted(
                    RotuloDaEmbalagem.de(unidade.getSigla(), quantidade, regras.unidadeDeVenda.getSigla())),
                    campo(indice, "unidadeId"));
        }
        if (informada.deCompra() && regras.temDeCompra) {
            throw new RegraDeNegocioException(MENSAGEM_DUAS_DE_COMPRA, campo(indice, "deCompra"));
        }
        regras.temDeCompra |= informada.deCompra();
        validarPreco(informada.preco(), quantidade, precoMinimo, regras.unidadeDeVenda, indice);
        return new DadosEmbalagem(unidade, quantidade, informada.preco(), informada.deCompra(), indice);
    }

    /**
     * Unidade da empresa (404 se de outra), ativa ou a atual da embalagem
     * (inativada depois), e diferente da unidade de venda.
     */
    private UnidadeMedida validarUnidade(Long empresaId, UUID unidadeId, ProdutoEmbalagem existente,
            UnidadeMedida unidadeDeVenda, int indice) {
        String campo = campo(indice, "unidadeId");
        if (unidadeId == null) {
            throw new RegraDeNegocioException(MENSAGEM_UNIDADE_OBRIGATORIA, campo);
        }
        UnidadeMedida unidade = unidadeService.buscarDaEmpresa(empresaId, unidadeId);
        boolean atualDaEmbalagem = existente != null && Objects.equals(existente.getUnidade().getId(), unidade.getId());
        if (!unidade.isAtivo() && !atualDaEmbalagem) {
            throw new RegraDeNegocioException(MENSAGEM_UNIDADE_INATIVA, campo);
        }
        if (Objects.equals(unidade.getId(), unidadeDeVenda.getId())) {
            throw new RegraDeNegocioException(MENSAGEM_UNIDADE_DE_VENDA.formatted(unidadeDeVenda.getSigla()), campo);
        }
        return unidade;
    }

    /** Maior que 1, ate 3 casas (defesa alem do Bean Validation) e inteira se a unidade de venda nao for fracionada. */
    private static BigDecimal validarQuantidade(BigDecimal quantidade, UnidadeMedida unidadeDeVenda, int indice) {
        String campo = campo(indice, "quantidade");
        if (quantidade == null) {
            throw new RegraDeNegocioException(MENSAGEM_QUANTIDADE_OBRIGATORIA, campo);
        }
        if (quantidade.compareTo(BigDecimal.ONE) <= 0) {
            throw new RegraDeNegocioException(MENSAGEM_QUANTIDADE_ATE_UM.formatted(unidadeDeVenda.getSigla()), campo);
        }
        if (quantidade.stripTrailingZeros().scale() > CASAS_DA_QUANTIDADE
                || quantidade.compareTo(QuantidadeDeEstoque.MAXIMO) > 0) {
            throw new RegraDeNegocioException(MENSAGEM_QUANTIDADE_LIMITE, campo);
        }
        if (!UnidadeMedida.quantidadeValida(unidadeDeVenda.isFracionada(), quantidade)) {
            throw new RegraDeNegocioException(MENSAGEM_SEM_FRACAO.formatted(unidadeDeVenda.getSigla()), campo);
        }
        return quantidade.setScale(CASAS_DA_QUANTIDADE, RoundingMode.UNNECESSARY);
    }

    /**
     * Preco proprio maior que zero e, com preco minimo, nao abaixo dele por
     * unidade (spec 3.3). A comparacao e {@code preco < minimo x quantidade},
     * sem divisao; o valor por unidade da mensagem e truncado a centavos, para
     * nunca exibir um valor igual ao minimo. O preco calculado nao e conferido.
     */
    private static void validarPreco(BigDecimal preco, BigDecimal quantidade, BigDecimal precoMinimo,
            UnidadeMedida unidadeDeVenda, int indice) {
        if (preco == null) {
            return;
        }
        String campo = campo(indice, "preco");
        if (preco.signum() <= 0) {
            throw new RegraDeNegocioException(MENSAGEM_PRECO_NAO_POSITIVO, campo);
        }
        if (precoMinimo != null && preco.compareTo(precoMinimo.multiply(quantidade)) < 0) {
            BigDecimal porUnidade = preco.divide(quantidade, CASAS_DO_REAL, RoundingMode.DOWN);
            throw new RegraDeNegocioException(MENSAGEM_ABAIXO_DO_MINIMO.formatted(emReais(porUnidade),
                    unidadeDeVenda.getSigla(), emReais(precoMinimo)), campo);
        }
    }

    // ---------- Codigos de barras ----------

    /**
     * O mesmo codigo nao pode estar na unidade e numa embalagem nem em duas
     * embalagens (400 na lista da segunda ocorrencia; sem a lista de
     * embalagens no PATCH, a da unidade vem por ultimo e e ela que aponta o
     * erro); depois, cada lista pelas regras do {@link ValidadorDeCodigosDeBarras}
     * (ate 5, digito GS1, unicidade na empresa fora deste produto).
     */
    private List<List<CodigoBarrasValidado>> validarCodigos(Long empresaId, Produto produtoAtual,
            List<EmbalagemRequest> lista, List<String> codigosDaUnidade, boolean listaInformada) {
        List<List<String>> listas = new ArrayList<>();
        lista.forEach(informada -> listas.add(informada.codigosBarras()));
        int quantidadeDeEmbalagens = lista.size();
        if (listaInformada) {
            listas.add(0, codigosDaUnidade);
            validadorDeCodigos.exigirSemRepetidosEntreListas(listas,
                    indice -> indice == 0 ? CAMPO_CODIGOS_DA_UNIDADE : campo(indice - 1, "codigosBarras"));
        } else {
            listas.add(codigosDaUnidade);
            validadorDeCodigos.exigirSemRepetidosEntreListas(listas,
                    indice -> indice == quantidadeDeEmbalagens
                            ? CAMPO_CODIGOS_DA_UNIDADE
                            : campo(indice, "codigosBarras"));
        }
        Map<String, FormatoCodigoBarras> gravados = formatosGravados(produtoAtual);
        Long produtoAtualId = produtoAtual == null ? null : produtoAtual.getId();
        List<List<CodigoBarrasValidado>> validados = new ArrayList<>(quantidadeDeEmbalagens);
        for (int indice = 0; indice < quantidadeDeEmbalagens; indice++) {
            validados.add(validadorDeCodigos.validar(empresaId, lista.get(indice).codigosBarras(),
                    MAXIMO_CODIGOS_POR_EMBALAGEM, MENSAGEM_LIMITE_DE_CODIGOS, campo(indice, "codigosBarras"),
                    gravados, produtoAtualId));
        }
        return validados;
    }

    /**
     * Codigo → formato gravado de todos os codigos do produto (unidade e
     * embalagens): um codigo que muda de lista mantem o formato com que foi
     * gravado.
     */
    static Map<String, FormatoCodigoBarras> formatosGravados(Produto produto) {
        if (produto == null) {
            return Map.of();
        }
        Map<String, FormatoCodigoBarras> formatos = new HashMap<>();
        produto.getCodigosBarras().forEach(codigo -> formatos.put(codigo.getCodigo(), codigo.getFormato()));
        produto.getEmbalagens().forEach(embalagem -> embalagem.getCodigosBarras()
                .forEach(codigo -> formatos.put(codigo.getCodigo(), codigo.getFormato())));
        return formatos;
    }

    // ---------- Reconciliacao ----------

    private static boolean semEmbalagens(Produto produto) {
        return produto == null || produto.getEmbalagens().isEmpty();
    }

    /** As embalagens atuais como se tivessem sido reenviadas sem mudanca (PATCH sem a lista). */
    private static List<EmbalagemRequest> comoInformadas(Produto produto) {
        if (produto == null) {
            return List.of();
        }
        return produto.getEmbalagens().stream()
                .map(embalagem -> new EmbalagemRequest(embalagem.getUuid(), embalagem.getUnidade().getUuid(),
                        embalagem.getQuantidade(), embalagem.getPreco(), embalagem.isDeCompra(),
                        ListaDeCodigosDeBarras.textos(embalagem.getCodigosBarras())))
                .toList();
    }

    private static Map<UUID, ProdutoEmbalagem> porUuid(Produto produto) {
        Map<UUID, ProdutoEmbalagem> atuais = new LinkedHashMap<>();
        if (produto != null) {
            produto.getEmbalagens().forEach(embalagem -> atuais.put(embalagem.getUuid(), embalagem));
        }
        return atuais;
    }

    /**
     * A embalagem atual com o {@code id}, tirada das nao reconciliadas (as que
     * sobram sao removidas). {@code id} de outro produto, inexistente ou
     * repetido na lista: 404, sem revelar se existe em outro lugar.
     */
    private static ProdutoEmbalagem reconciliar(UUID id, Map<UUID, ProdutoEmbalagem> naoReconciliadas) {
        if (id == null) {
            return null;
        }
        ProdutoEmbalagem existente = naoReconciliadas.remove(id);
        if (existente == null) {
            throw new CatalogoNaoEncontradoException(MENSAGEM_NAO_ENCONTRADA);
        }
        return existente;
    }

    private static List<EmbalagemPlanejada> planejadas(List<ProdutoEmbalagem> existentes, List<DadosEmbalagem> dados,
            List<List<CodigoBarrasValidado>> codigos, UnidadeMedida unidadeDeVenda) {
        List<EmbalagemPlanejada> planejadas = new ArrayList<>(dados.size());
        for (int indice = 0; indice < dados.size(); indice++) {
            DadosEmbalagem dadosDaEmbalagem = dados.get(indice);
            ProdutoEmbalagem existente = existentes.get(indice);
            String rotulo = RotuloDaEmbalagem.de(dadosDaEmbalagem.unidade().getSigla(), dadosDaEmbalagem.quantidade(),
                    unidadeDeVenda.getSigla());
            planejadas.add(new EmbalagemPlanejada(existente, dadosDaEmbalagem, codigos.get(indice), rotulo,
                    existente == null ? null : existente.getPreco()));
        }
        return planejadas;
    }

    /** Rotulo e preco do momento, com a unidade de venda de antes do salvamento. */
    private static List<EmbalagemRemovida> removidas(Map<UUID, ProdutoEmbalagem> naoReconciliadas) {
        return naoReconciliadas.values().stream()
                .map(embalagem -> new EmbalagemRemovida(embalagem, embalagem.rotulo(), embalagem.getPreco()))
                .toList();
    }

    private static Set<String> textos(List<CodigoBarrasValidado> codigos) {
        return codigos.stream().map(CodigoBarrasValidado::codigo).collect(Collectors.toSet());
    }

    /** "R$ 1.499,99": separador de milhar e virgula decimal, sem o espaco especial do formato de moeda. */
    private static String emReais(BigDecimal valor) {
        NumberFormat formato = NumberFormat.getNumberInstance(PORTUGUES_DO_BRASIL);
        formato.setMinimumFractionDigits(CASAS_DO_REAL);
        formato.setMaximumFractionDigits(CASAS_DO_REAL);
        return "R$ " + formato.format(valor);
    }
}
