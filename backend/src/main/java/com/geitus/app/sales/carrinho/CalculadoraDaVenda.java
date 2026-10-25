package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.catalog.PrecoAplicado;
import com.geitus.app.catalog.PrecoDaEmbalagem;
import com.geitus.app.catalog.PrecoDeVenda;
import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.balanca.LeituraEtiqueta;
import com.geitus.app.catalog.balanca.TipoInformacaoEtiqueta;
import com.geitus.app.shared.formato.FormatoBrasileiro;

/**
 * Calculo do carrinho (docs/modules/pdv.md, 3.1 a 3.4 e 5.2): preco de cada
 * linha, descontos (do item e do total, com a reparticao), total, pagamento,
 * troco e o recebido por forma. Regra pura, sem banco: e a mesma no
 * {@code POST /api/pdv/calculo} e na finalizacao.
 *
 * <p>Regras violadas nao lancam excecao: vao para {@link CalculoDaVenda#erros()}
 * com o campo. Um desconto invalido entra como zero nos valores (o total
 * continua coerente na tela enquanto o erro aparece).
 *
 * <p>Dinheiro com 2 casas e quantidades com 3, arredondando meio para cima.
 */
public final class CalculadoraDaVenda {

    public static final int LIMITE_DE_LINHAS = 300;
    public static final BigDecimal LIMITE_DE_VALOR = new BigDecimal("9999999999.99");

    static final String CAMPO_ITENS = "itens";
    static final String CAMPO_DESCONTO = "desconto";
    static final String CAMPO_PAGAMENTOS = "pagamentos";
    static final String CAMPO_TOTAL = "total";

    public static final String MENSAGEM_LIMITE_DE_LINHAS = "A venda atingiu o limite de 300 itens.";
    static final String MENSAGEM_PESO_SEM_FRACAO = "Etiqueta de peso para produto que não é vendido por peso.";
    static final String MENSAGEM_SEM_PRECO = "Produto sem preço de venda.";
    static final String MENSAGEM_ETIQUETA_FORA_DO_PRECO = "O valor da etiqueta (%s) não confere com o preço de %s (%s).";
    static final String MENSAGEM_VALOR_DO_ITEM_ACIMA = "O valor do item passa do limite.";
    static final String MENSAGEM_TOTAL_ACIMA = "O total da venda passa do limite.";
    static final String MENSAGEM_DESCONTO_NEGATIVO = "O desconto não pode ser negativo.";
    static final String MENSAGEM_DESCONTO_CASAS = "Informe o desconto com até 2 casas decimais.";
    static final String MENSAGEM_DESCONTO_ACIMA_DO_ITEM = "O desconto passa do valor do item.";
    static final String MENSAGEM_DESCONTO_ACIMA_DO_SUBTOTAL = "O desconto passa do subtotal.";
    static final String MENSAGEM_TOTAL_NAO_POSITIVO = "O total da venda precisa ser maior que zero.";
    static final String MENSAGEM_LIMITE_DO_OPERADOR = "O desconto passa do limite do operador (%s%%).";
    static final String MENSAGEM_PRECO_MINIMO = "O desconto deixa %s abaixo do preço mínimo (%s por %s).";
    static final String MENSAGEM_ETIQUETA_ABAIXO_DO_MINIMO =
            "O valor da etiqueta deixa %s abaixo do preço mínimo (%s por %s).";
    static final String MENSAGEM_FORMA_REPETIDA = "Use uma linha por forma de pagamento.";
    static final String MENSAGEM_ESCOLHA_A_FORMA = "Escolha a forma de pagamento.";
    static final String MENSAGEM_PAGAMENTO_NAO_POSITIVO = "O valor deve ser maior que zero.";
    static final String MENSAGEM_PAGAMENTO_CASAS = "Informe um valor com até 2 casas decimais.";
    static final String MENSAGEM_CARTAO_ACIMA_DO_TOTAL =
            "Cartão e PIX não podem passar do total. O troco só sai do dinheiro.";
    static final String MENSAGEM_FALTA_PAGAR = "Falta pagar %s.";

    private static final int CASAS_DO_REAL = 2;
    private static final BigDecimal CEM = new BigDecimal("100");
    private static final BigDecimal CENTAVO = new BigDecimal("0.01");
    private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(CASAS_DO_REAL);

    private CalculadoraDaVenda() {
        // Apenas metodos estaticos.
    }

    /**
     * @param descontoDoTotal {@code null} sem desconto do total
     * @param pagamentos vazio enquanto o operador ainda nao abriu o pagamento
     *        (o "Falta pagar" so e erro com algum pagamento informado)
     * @param ehAdmin perfil do banco: o ADMIN nao tem o limite percentual
     */
    public static CalculoDaVenda calcular(List<LinhaParaCalculo> linhas, DescontoInformado descontoDoTotal,
            List<PagamentoInformado> pagamentos, boolean ehAdmin, BigDecimal descontoMaximoOperador,
            LocalDate hoje) {
        List<ErroDoCalculo> erros = new ArrayList<>();
        if (linhas.size() > LIMITE_DE_LINHAS) {
            erros.add(new ErroDoCalculo(CAMPO_ITENS, MENSAGEM_LIMITE_DE_LINHAS));
        }
        List<LinhaPrecificada> precificadas = precificar(linhas, hoje, erros);
        BigDecimal subtotal = soma(precificadas, LinhaPrecificada::valorBruto);
        BigDecimal descontoItens = soma(precificadas, LinhaPrecificada::descontoItem);
        if (subtotal.compareTo(LIMITE_DE_VALOR) > 0) {
            erros.add(new ErroDoCalculo(CAMPO_ITENS, MENSAGEM_TOTAL_ACIMA));
        }
        BigDecimal base = subtotal.subtract(descontoItens);
        BigDecimal descontoTotal = descontoDoTotal(descontoDoTotal, base, erros);
        List<LinhaCalculada> calculadas = repartir(precificadas, descontoTotal, base);
        BigDecimal total = base.subtract(descontoTotal);
        if (!linhas.isEmpty() && total.signum() <= 0) {
            erros.add(new ErroDoCalculo(CAMPO_TOTAL, MENSAGEM_TOTAL_NAO_POSITIVO));
        }
        conferirLimiteDoOperador(ehAdmin, descontoMaximoOperador, subtotal, descontoItens.add(descontoTotal), erros);
        conferirPrecoMinimo(calculadas, erros);
        Pagamento pagamento = Pagamento.de(pagamentos, total, erros);
        return new CalculoDaVenda(calculadas, subtotal, descontoItens, descontoTotal, total, pagamento.pago(),
                pagamento.troco(), pagamento.faltaPagar(), pagamento.porForma(), pagamento.recebidos(), erros,
                List.of());
    }

    // ---------- Preco e desconto do item (3.1, 3.2 e 3.3) ----------

    /** Linha com preco, valores e quantidades, antes da reparticao do desconto do total. */
    private record LinhaPrecificada(LinhaParaCalculo linha, BigDecimal quantidade, BigDecimal quantidadeEstoque,
            BigDecimal precoUnitario, OrigemPrecoDaVenda origem, BigDecimal valorBruto, BigDecimal descontoItem) {

        BigDecimal liquidoDoItem() {
            return valorBruto.subtract(descontoItem);
        }
    }

    private static List<LinhaPrecificada> precificar(List<LinhaParaCalculo> linhas, LocalDate hoje,
            List<ErroDoCalculo> erros) {
        Map<Long, BigDecimal> unidadesPorProduto = quantidadesDasUnidades(linhas);
        List<LinhaPrecificada> precificadas = new ArrayList<>();
        for (LinhaParaCalculo linha : linhas) {
            LinhaPrecificada semDesconto = linha.etiqueta() != null
                    ? daEtiqueta(linha, unidadesPorProduto, hoje, erros)
                    : daQuantidade(linha, unidadesPorProduto, hoje, erros);
            if (semDesconto.valorBruto().compareTo(LIMITE_DE_VALOR) > 0) {
                erros.add(new ErroDoCalculo(linha.campo(), MENSAGEM_VALOR_DO_ITEM_ACIMA));
            }
            BigDecimal descontoItem = descontoDoItem(linha, semDesconto.valorBruto(), erros);
            precificadas.add(new LinhaPrecificada(linha, semDesconto.quantidade(), semDesconto.quantidadeEstoque(),
                    semDesconto.precoUnitario(), semDesconto.origem(), semDesconto.valorBruto(), descontoItem));
        }
        return precificadas;
    }

    /**
     * Soma das quantidades validas das linhas de unidade (sem embalagem) e das
     * etiquetas de UN aceitas (1 cada) de cada produto: decide o atacado de
     * todas elas (3.2). A etiqueta de produto fracionado nao entra.
     */
    private static Map<Long, BigDecimal> quantidadesDasUnidades(List<LinhaParaCalculo> linhas) {
        Map<Long, BigDecimal> somas = new HashMap<>();
        for (LinhaParaCalculo linha : linhas) {
            if (linha.daUnidade() && quantidadeValida(linha)) {
                somas.merge(linha.produto().getId(), linha.quantidade(), BigDecimal::add);
            } else if (etiquetaDeUnidadeAceita(linha)) {
                somas.merge(linha.produto().getId(), BigDecimal.ONE, BigDecimal::add);
            }
        }
        return somas;
    }

    /** Etiqueta de VALOR de produto em unidade inteira com exatamente o preco de venda normal de 1 unidade. */
    private static boolean etiquetaDeUnidadeAceita(LinhaParaCalculo linha) {
        LeituraEtiqueta leitura = linha.etiqueta();
        Produto produto = linha.produto();
        return leitura != null && leitura.tipo() == TipoInformacaoEtiqueta.VALOR
                && !produto.getUnidade().isFracionada() && produto.getPrecoVenda().signum() > 0
                && emReais(leitura.valor()).compareTo(produto.getPrecoVenda()) == 0;
    }

    private static LinhaPrecificada daQuantidade(LinhaParaCalculo linha, Map<Long, BigDecimal> unidadesPorProduto,
            LocalDate hoje, List<ErroDoCalculo> erros) {
        boolean embalagem = linha.embalagem() != null;
        String sigla = embalagem ? linha.embalagem().getUnidade().getSigla() : linha.produto().getUnidade().getSigla();
        boolean aceitaFracao = !embalagem && linha.produto().getUnidade().isFracionada();
        QuantidadeDaLinha.recusa(linha.quantidade(), aceitaFracao, sigla)
                .ifPresent(mensagem -> erros.add(new ErroDoCalculo(linha.campo() + ".quantidade", mensagem)));
        BigDecimal quantidade = quantidadeValida(linha) ? emQuantidade(linha.quantidade()) : emQuantidade(BigDecimal.ZERO);
        if (embalagem) {
            BigDecimal preco = PrecoDaEmbalagem.calcular(linha.embalagem().getPreco(), linha.embalagem().getQuantidade(),
                    PrecoDeVenda.vigenteSemAtacado(linha.produto(), hoje)).preco();
            return semDesconto(linha, quantidade, emQuantidade(quantidade.multiply(linha.embalagem().getQuantidade())),
                    preco, OrigemPrecoDaVenda.EMBALAGEM, emReais(quantidade.multiply(preco)));
        }
        PrecoAplicado preco = precoDaUnidade(linha.produto(), unidadesPorProduto.get(linha.produto().getId()), hoje);
        return semDesconto(linha, quantidade, quantidade, preco.precoUnitario(), OrigemPrecoDaVenda.da(preco.origem()),
                emReais(quantidade.multiply(preco.precoUnitario())));
    }

    /** O preco de todas as linhas de unidade do produto; sem quantidade valida, o vigente sem atacado. */
    private static PrecoAplicado precoDaUnidade(Produto produto, BigDecimal quantidadeTotal, LocalDate hoje) {
        if (quantidadeTotal == null || quantidadeTotal.signum() <= 0) {
            return PrecoDeVenda.vigenteSemAtacado(produto, hoje);
        }
        return PrecoDeVenda.resolver(produto, quantidadeTotal, hoje);
    }

    /**
     * Etiqueta de balanca (3.1).
     * <ul>
     *   <li>Produto fracionado: valor, a quantidade e valor / preco vigente sem
     *       atacado (3 casas) e o valor e o da etiqueta; peso, o valor e peso x
     *       preco.</li>
     *   <li>Produto em unidade inteira: so etiqueta de valor, com exatamente o
     *       preco de venda normal de 1 unidade; a linha e 1 UN com o preco das
     *       regras da unidade (promocional, atacado pela soma com as linhas de
     *       unidade). Peso: recusada.</li>
     * </ul>
     */
    private static LinhaPrecificada daEtiqueta(LinhaParaCalculo linha, Map<Long, BigDecimal> unidadesPorProduto,
            LocalDate hoje, List<ErroDoCalculo> erros) {
        LeituraEtiqueta leitura = linha.etiqueta();
        Produto produto = linha.produto();
        BigDecimal preco = PrecoDeVenda.vigenteSemAtacado(produto, hoje).precoUnitario();
        if (preco.signum() <= 0 || produto.getPrecoVenda().signum() <= 0) {
            // Sem preco nao ha quantidade a calcular (seria uma divisao por zero): linha zerada e o erro.
            erros.add(new ErroDoCalculo(linha.campo(), MENSAGEM_SEM_PRECO));
            BigDecimal zero = emQuantidade(BigDecimal.ZERO);
            return semDesconto(linha, zero, zero, ZERO, OrigemPrecoDaVenda.ETIQUETA, ZERO);
        }
        if (!produto.getUnidade().isFracionada()) {
            return daEtiquetaDeUnidade(linha, unidadesPorProduto, hoje, erros);
        }
        LinhaPrecificada precificada;
        if (leitura.tipo() == TipoInformacaoEtiqueta.PESO) {
            BigDecimal peso = emQuantidade(leitura.valor());
            precificada = semDesconto(linha, peso, peso, preco, OrigemPrecoDaVenda.ETIQUETA,
                    emReais(peso.multiply(preco)));
        } else {
            BigDecimal valor = emReais(leitura.valor());
            BigDecimal quantidade = valor.divide(preco, QuantidadeDaLinha.CASAS, RoundingMode.HALF_UP);
            precificada = semDesconto(linha, quantidade, quantidade, preco, OrigemPrecoDaVenda.ETIQUETA, valor);
        }
        if (precificada.quantidade().signum() <= 0) {
            erros.add(new ErroDoCalculo(linha.campo(), QuantidadeDaLinha.MENSAGEM_NAO_POSITIVA));
        }
        return precificada;
    }

    /** 1 UN com o preco das regras da unidade; a etiqueta de peso e a de outro valor sao recusadas. */
    private static LinhaPrecificada daEtiquetaDeUnidade(LinhaParaCalculo linha,
            Map<Long, BigDecimal> unidadesPorProduto, LocalDate hoje, List<ErroDoCalculo> erros) {
        Produto produto = linha.produto();
        if (linha.etiqueta().tipo() == TipoInformacaoEtiqueta.PESO) {
            erros.add(new ErroDoCalculo(linha.campo(), MENSAGEM_PESO_SEM_FRACAO));
        } else if (!etiquetaDeUnidadeAceita(linha)) {
            erros.add(new ErroDoCalculo(linha.campo(), MENSAGEM_ETIQUETA_FORA_DO_PRECO.formatted(
                    FormatoBrasileiro.reais(linha.etiqueta().valor()), produto.getNome(),
                    FormatoBrasileiro.reais(produto.getPrecoVenda()))));
        }
        BigDecimal uma = emQuantidade(BigDecimal.ONE);
        PrecoAplicado preco = precoDaUnidade(produto, unidadesPorProduto.get(produto.getId()), hoje);
        return semDesconto(linha, uma, uma, preco.precoUnitario(), OrigemPrecoDaVenda.da(preco.origem()),
                emReais(preco.precoUnitario()));
    }

    private static LinhaPrecificada semDesconto(LinhaParaCalculo linha, BigDecimal quantidade,
            BigDecimal quantidadeEstoque, BigDecimal preco, OrigemPrecoDaVenda origem, BigDecimal bruto) {
        return new LinhaPrecificada(linha, quantidade, quantidadeEstoque, emReais(preco), origem, bruto, ZERO);
    }

    /** Desconto do item em R$ ou % do valor bruto, sem passar dele; invalido entra como zero. */
    private static BigDecimal descontoDoItem(LinhaParaCalculo linha, BigDecimal bruto, List<ErroDoCalculo> erros) {
        return valorDoDesconto(linha.desconto(), bruto, new CampoDoDesconto(linha.campo() + ".desconto",
                MENSAGEM_DESCONTO_ACIMA_DO_ITEM), erros);
    }

    // ---------- Desconto do total e reparticao (3.3) ----------

    private static BigDecimal descontoDoTotal(DescontoInformado informado, BigDecimal base,
            List<ErroDoCalculo> erros) {
        return valorDoDesconto(informado, base, new CampoDoDesconto(CAMPO_DESCONTO,
                MENSAGEM_DESCONTO_ACIMA_DO_SUBTOTAL), erros);
    }

    /** O campo do desconto e a mensagem de quando ele passa da base (o item ou o subtotal). */
    private record CampoDoDesconto(String campo, String mensagemAcima) {
    }

    /**
     * O desconto em reais sobre a base; invalido: erro no campo e zero. O
     * teto (a base em R$, ou 100 no percentual) e conferido antes de qualquer
     * conta ou mudanca de escala, entao um valor como {@code 1E+400000000} e
     * recusado sem custo. O percentual arredonda para baixo, a favor da loja:
     * X% nunca vira mais que X% do valor.
     */
    private static BigDecimal valorDoDesconto(DescontoInformado informado, BigDecimal base, CampoDoDesconto campo,
            List<ErroDoCalculo> erros) {
        if (informado == null || informado.valor() == null || informado.tipo() == null) {
            return ZERO;
        }
        BigDecimal valor = informado.valor();
        if (valor.signum() < 0) {
            erros.add(new ErroDoCalculo(campo.campo(), MENSAGEM_DESCONTO_NEGATIVO));
            return ZERO;
        }
        BigDecimal teto = informado.tipo() == TipoDesconto.PERCENTUAL ? CEM : base;
        if (valor.compareTo(teto) > 0) {
            erros.add(new ErroDoCalculo(campo.campo(), campo.mensagemAcima()));
            return ZERO;
        }
        if (valor.stripTrailingZeros().scale() > CASAS_DO_REAL) {
            erros.add(new ErroDoCalculo(campo.campo(), MENSAGEM_DESCONTO_CASAS));
            return ZERO;
        }
        return switch (informado.tipo()) {
            case VALOR -> emReais(valor);
            case PERCENTUAL -> base.multiply(valor).divide(CEM).setScale(CASAS_DO_REAL, RoundingMode.DOWN);
        };
    }

    /**
     * Reparte o desconto do total entre as linhas, proporcional ao valor de cada
     * uma ja com o desconto do item, em centavos para baixo; o resto vai para a
     * linha de maior valor (empate: a primeira) e, se nao couber nela, para as
     * seguintes em valor.
     */
    private static List<LinhaCalculada> repartir(List<LinhaPrecificada> linhas, BigDecimal descontoTotal,
            BigDecimal base) {
        BigDecimal[] partes = new BigDecimal[linhas.size()];
        BigDecimal repartido = ZERO;
        for (int i = 0; i < linhas.size(); i++) {
            partes[i] = descontoTotal.signum() == 0 || base.signum() == 0
                    ? ZERO
                    : descontoTotal.multiply(linhas.get(i).liquidoDoItem()).divide(base, CASAS_DO_REAL,
                            RoundingMode.DOWN);
            repartido = repartido.add(partes[i]);
        }
        distribuirOResto(linhas, partes, descontoTotal.subtract(repartido));
        List<LinhaCalculada> calculadas = new ArrayList<>();
        for (int i = 0; i < linhas.size(); i++) {
            calculadas.add(calculada(linhas.get(i), partes[i]));
        }
        return calculadas;
    }

    private static void distribuirOResto(List<LinhaPrecificada> linhas, BigDecimal[] partes, BigDecimal resto) {
        List<Integer> porValor = new ArrayList<>();
        for (int i = 0; i < linhas.size(); i++) {
            porValor.add(i);
        }
        porValor.sort(Comparator.comparing((Integer i) -> linhas.get(i).liquidoDoItem()).reversed()
                .thenComparing(i -> i));
        BigDecimal falta = resto;
        for (int i : porValor) {
            if (falta.signum() <= 0) {
                return;
            }
            BigDecimal cabe = linhas.get(i).liquidoDoItem().subtract(partes[i]).min(falta);
            partes[i] = partes[i].add(cabe);
            falta = falta.subtract(cabe);
        }
    }

    private static LinhaCalculada calculada(LinhaPrecificada linha, BigDecimal descontoRateado) {
        LinhaParaCalculo origem = linha.linha();
        return new LinhaCalculada(origem.ordem(), origem.produto(), origem.embalagem(), origem.etiqueta() != null,
                origem.codigoLido(), linha.quantidade(), linha.quantidadeEstoque(), linha.precoUnitario(),
                linha.origem(), linha.valorBruto(), linha.descontoItem(), descontoRateado,
                linha.liquidoDoItem().subtract(descontoRateado));
    }

    // ---------- Limites do desconto (3.3) ----------

    /** (descontos dos itens + desconto do total) / subtotal x 100 <= limite, so para o OPERADOR. */
    private static void conferirLimiteDoOperador(boolean ehAdmin, BigDecimal limite, BigDecimal subtotal,
            BigDecimal descontos, List<ErroDoCalculo> erros) {
        if (ehAdmin || descontos.signum() == 0 || subtotal.signum() == 0) {
            return;
        }
        if (descontos.multiply(CEM).compareTo(limite.multiply(subtotal)) > 0) {
            erros.add(new ErroDoCalculo(CAMPO_DESCONTO,
                    MENSAGEM_LIMITE_DO_OPERADOR.formatted(FormatoBrasileiro.numero(limite))));
        }
    }

    /**
     * O liquido por unidade de estoque nao fica abaixo do preco minimo, para
     * todos: com desconto, em qualquer linha; na etiqueta, sempre (o valor dela
     * tambem nao pode ficar abaixo do minimo).
     */
    private static void conferirPrecoMinimo(List<LinhaCalculada> linhas, List<ErroDoCalculo> erros) {
        for (LinhaCalculada linha : linhas) {
            BigDecimal minimo = linha.produto().getPrecoMinimo();
            if (minimo == null) {
                continue;
            }
            BigDecimal piso = emReais(minimo.multiply(linha.quantidadeEstoque()));
            boolean temDesconto = linha.descontoItem().add(linha.descontoRateado()).signum() > 0;
            String mensagem = null;
            if (linha.origem() == OrigemPrecoDaVenda.ETIQUETA && linha.valorBruto().compareTo(piso) < 0) {
                mensagem = MENSAGEM_ETIQUETA_ABAIXO_DO_MINIMO;
            } else if (temDesconto && linha.valorLiquido().compareTo(piso) < 0) {
                mensagem = MENSAGEM_PRECO_MINIMO;
            }
            if (mensagem != null) {
                erros.add(new ErroDoCalculo(linha.campo(), mensagem.formatted(linha.produto().getNome(),
                        FormatoBrasileiro.reais(minimo), linha.produto().getUnidade().getSigla())));
            }
        }
    }

    // ---------- Pagamento (3.4) ----------

    /** Pago, troco, falta, os pagamentos validos (normalizados) e o recebido por forma (no dinheiro, sem o troco). */
    private record Pagamento(BigDecimal pago, BigDecimal troco, BigDecimal faltaPagar,
            Map<FormaDePagamento, BigDecimal> porForma, Map<FormaDePagamento, BigDecimal> recebidos) {

        static Pagamento de(List<PagamentoInformado> pagamentos, BigDecimal total, List<ErroDoCalculo> erros) {
            Map<FormaDePagamento, BigDecimal> porForma = validos(pagamentos, erros);
            BigDecimal pago = porForma.values().stream().reduce(ZERO, BigDecimal::add);
            BigDecimal dinheiro = porForma.getOrDefault(FormaDePagamento.DINHEIRO, ZERO);
            if (pago.subtract(dinheiro).compareTo(total) > 0) {
                erros.add(new ErroDoCalculo(CAMPO_PAGAMENTOS, MENSAGEM_CARTAO_ACIMA_DO_TOTAL));
            }
            BigDecimal faltaPagar = total.subtract(pago).max(ZERO);
            if (!pagamentos.isEmpty() && faltaPagar.signum() > 0) {
                erros.add(new ErroDoCalculo(CAMPO_PAGAMENTOS,
                        MENSAGEM_FALTA_PAGAR.formatted(FormatoBrasileiro.reais(faltaPagar))));
            }
            BigDecimal troco = pago.subtract(total).max(ZERO).min(dinheiro);
            Map<FormaDePagamento, BigDecimal> recebidos = new EnumMap<>(FormaDePagamento.class);
            porForma.forEach((forma, valor) -> {
                BigDecimal recebido = forma == FormaDePagamento.DINHEIRO ? valor.subtract(troco) : valor;
                if (recebido.signum() > 0) {
                    recebidos.put(forma, recebido);
                }
            });
            return new Pagamento(pago, troco, faltaPagar, porForma, recebidos);
        }

        /** Uma linha por forma, valor > 0 com ate 2 casas; as invalidas ficam de fora (com erro). */
        private static Map<FormaDePagamento, BigDecimal> validos(List<PagamentoInformado> pagamentos,
                List<ErroDoCalculo> erros) {
            Map<FormaDePagamento, BigDecimal> porForma = new EnumMap<>(FormaDePagamento.class);
            for (int i = 0; i < pagamentos.size(); i++) {
                PagamentoInformado pagamento = pagamentos.get(i);
                String campo = CAMPO_PAGAMENTOS + "[" + i + "]";
                if (pagamento.forma() == null) {
                    erros.add(new ErroDoCalculo(campo + ".forma", MENSAGEM_ESCOLHA_A_FORMA));
                } else if (porForma.containsKey(pagamento.forma())) {
                    erros.add(new ErroDoCalculo(CAMPO_PAGAMENTOS, MENSAGEM_FORMA_REPETIDA));
                } else if (pagamento.valor() == null || pagamento.valor().signum() <= 0) {
                    erros.add(new ErroDoCalculo(campo + ".valor", MENSAGEM_PAGAMENTO_NAO_POSITIVO));
                } else if (pagamento.valor().stripTrailingZeros().scale() > CASAS_DO_REAL
                        || pagamento.valor().compareTo(LIMITE_DE_VALOR) > 0) {
                    erros.add(new ErroDoCalculo(campo + ".valor", MENSAGEM_PAGAMENTO_CASAS));
                } else {
                    porForma.put(pagamento.forma(), emReais(pagamento.valor()));
                }
            }
            return porForma;
        }
    }

    // ---------- Apoio ----------

    private static boolean quantidadeValida(LinhaParaCalculo linha) {
        return QuantidadeDaLinha.recusaGeral(linha.quantidade()).isEmpty();
    }

    private static BigDecimal soma(List<LinhaPrecificada> linhas,
            java.util.function.Function<LinhaPrecificada, BigDecimal> valor) {
        return linhas.stream().map(valor).reduce(ZERO, BigDecimal::add);
    }

    private static BigDecimal emReais(BigDecimal valor) {
        return valor.setScale(CASAS_DO_REAL, RoundingMode.HALF_UP);
    }

    private static BigDecimal emQuantidade(BigDecimal quantidade) {
        return quantidade.setScale(QuantidadeDaLinha.CASAS, RoundingMode.HALF_UP);
    }
}
