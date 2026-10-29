package com.geitus.app.sales;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.geitus.app.cashier.CaixaConflitoException;
import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.cashier.RecebimentosDoCaixa;
import com.geitus.app.cashier.RecebimentosDoCaixa.Reembolso;
import com.geitus.app.cashier.RecebimentosDoCaixa.SessaoAbertaParaVenda;
import com.geitus.app.iam.ResolvedorDoUsuarioAutenticado;
import com.geitus.app.inventory.EstoqueDaVenda;
import com.geitus.app.inventory.EstoqueDaVenda.DevolucaoDeItem;
import com.geitus.app.sales.CenarioDoPdv.EmpresaDoPdv;
import com.geitus.app.sales.CenarioDoPdv.NovoProduto;

/**
 * As portas de estoque e de caixa da devolucao de item (docs/modules/estoque.md,
 * secao 6.2; fatia 3b1) contra o contexto Spring e um PostgreSQL real: uma venda
 * real pelo PDV, a devolucao e os itens gravados por JDBC (o servico vem na 3b2)
 * e as portas chamadas numa transacao, como o servico vai chamar. A V19 confere
 * tudo no commit. Requer Docker.
 */
class PortasDaDevolucaoIT extends IntegracaoDoPdv {

    @Autowired
    private EstoqueDaVenda estoqueDaVenda;

    @Autowired
    private RecebimentosDoCaixa recebimentosDoCaixa;

    @Autowired
    private ResolvedorDoUsuarioAutenticado resolvedor;

    @Autowired
    private PlatformTransactionManager gerenciadorDeTransacoes;

    private EmpresaDoPdv empresa;
    private UUID caixaDoAdmin;

    /** A venda gravada pelo PDV com os ids internos que as portas usam. */
    private record VendaFeita(long venda, long item, long produto, UUID produtoUuid) {
    }

    /** Uma linha a devolver: a quantidade, o valor, o destino e o reembolso numa forma (ou nenhum). */
    private record Linha(String quantidade, String valor, boolean avariado, FormaDePagamento forma) {
    }

    @BeforeEach
    void abrirOsCaixas() throws Exception {
        empresa = pdv.novaEmpresa();
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        caixaDoAdmin = abrirCaixa(empresa.admin(), cenario.novoPonto(empresa.caixa(), "Caixa 2"), "100.00");
    }

    @Test
    void entradaVoltaAoEstoqueEReembolsoEmDinheiroSaiDaGavetaDeQuemDevolve() throws Exception {
        VendaFeita venda = vender(NovoProduto.de("Ração", "UN", "10.00").comEstoque("10"), "3", "DINHEIRO", "30.00");

        devolver(venda, new Linha("2", "20.00", false, FormaDePagamento.DINHEIRO));

        assertThat(pdv.saldo(venda.produtoUuid())).isEqualByComparingTo("9");
        assertThat(contar("SELECT count(*) FROM movimentos_estoque WHERE origem = 'DEVOLUCAO'"
                + " AND motivo = 'DEVOLUCAO_VENDA' AND quantidade = 2 AND produto_id = " + venda.produto()))
                .isEqualTo(1);
        assertThat(dinheiroNaGaveta(caixaDoAdmin)).isEqualByComparingTo("80.00");
        assertThat(contar("SELECT count(*) FROM movimentos_caixa WHERE tipo = 'DEVOLUCAO' AND sessao_caixa_id = "
                + pdv.idDaSessao(caixaDoAdmin) + " AND venda_id = " + venda.venda() + " AND devolucao_id IS NOT NULL"))
                .isEqualTo(1);
    }

    @Test
    void avariadoEntraESaiETerminaOndeEstavaMesmoNegativo() throws Exception {
        VendaFeita venda = vender(NovoProduto.de("Ração", "UN", "10.00").comEstoque("1"), "3", "DINHEIRO", "30.00");
        assertThat(pdv.saldo(venda.produtoUuid())).isEqualByComparingTo("-2");

        devolver(venda, new Linha("1", "10.00", true, FormaDePagamento.DINHEIRO));

        assertThat(pdv.saldo(venda.produtoUuid())).isEqualByComparingTo("-2");
        assertThat(jdbcTemplate.queryForList("SELECT motivo FROM movimentos_estoque WHERE origem = 'DEVOLUCAO'"
                + " AND empresa_id = ? ORDER BY id", String.class, empresa.id()))
                .containsExactly("DEVOLUCAO_VENDA", "PERDA_AVARIA");
    }

    @Test
    void itemQueNaoBaixouEstoqueNaoTemMovimento() throws Exception {
        VendaFeita venda = vender(NovoProduto.de("Brinde", "UN", "10.00").semControleDeEstoque(), "1", "DINHEIRO",
                "10.00");

        devolver(venda, new Linha("1", "10.00", false, FormaDePagamento.DINHEIRO));

        assertThat(contar("SELECT count(*) FROM movimentos_estoque WHERE origem = 'DEVOLUCAO'")).isZero();
        assertThat(contar("SELECT count(*) FROM devolucoes WHERE true")).isEqualTo(1);
    }

    @Test
    void dinheiroAlemDaGavetaDa409ComOValor() throws Exception {
        UUID caixaPequeno = trocarCaixaDoAdmin("10.00");
        VendaFeita venda = vender(NovoProduto.de("Ração", "UN", "10.00").comEstoque("5"), "2", "DINHEIRO", "20.00");

        assertThatThrownBy(() -> devolver(venda, new Linha("2", "20.00", false, FormaDePagamento.DINHEIRO)))
                .isInstanceOf(CaixaConflitoException.class)
                .hasMessage("Não há dinheiro suficiente na gaveta para devolver (R$ 10,00).");
        assertThat(contar("SELECT count(*) FROM devolucoes WHERE true")).isZero();
        assertThat(dinheiroNaGaveta(caixaPequeno)).isEqualByComparingTo("10.00");
    }

    @Test
    void pixNaoTemLimiteDeGavetaEOEsperadoDaFormaFicaNegativo() throws Exception {
        VendaFeita venda = vender(NovoProduto.de("Ração", "UN", "10.00").comEstoque("5"), "3", "PIX", "30.00");

        devolver(venda, new Linha("3", "30.00", false, FormaDePagamento.PIX));

        assertThat(esperado(caixaDoAdmin, "PIX")).isEqualByComparingTo("-30.00");
        assertThat(dinheiroNaGaveta(caixaDoAdmin)).isEqualByComparingTo("100.00");
    }

    @Test
    void reembolsadoPorFormaSomaAsDevolucoesDaVenda() throws Exception {
        VendaFeita venda = vender(NovoProduto.de("Ração", "UN", "10.00").comEstoque("5"), "3", "DINHEIRO", "30.00");
        devolver(venda, new Linha("1", "10.00", false, FormaDePagamento.DINHEIRO));
        devolver(venda, new Linha("1", "10.00", false, FormaDePagamento.DINHEIRO));

        Map<FormaDePagamento, BigDecimal> reembolsado = comResultado(() -> recebimentosDoCaixa
                .reembolsadoPorForma(empresa.id(), venda.venda()));

        assertThat(reembolsado).containsOnlyKeys(FormaDePagamento.DINHEIRO);
        assertThat(reembolsado.get(FormaDePagamento.DINHEIRO)).isEqualByComparingTo("20.00");
    }

    @Test
    void quemDevolveSemCaixaOuComOCaixaEmConferenciaRecebe409() {
        Long semCaixa = cenario.novoUsuario(empresa.caixa(), "Gerente", "ADMIN");
        assertThatThrownBy(() -> naTransacao(() -> recebimentosDoCaixa
                .travarSessaoParaDevolucao(resolvedor.resolver(semCaixa))))
                .isInstanceOf(CaixaConflitoException.class)
                .hasMessage("Abra o caixa para devolver.");

        cenario.emConferenciaPorJdbc(caixaDoAdmin, empresa.admin());
        assertThatThrownBy(() -> naTransacao(() -> recebimentosDoCaixa
                .travarSessaoParaDevolucao(resolvedor.resolver(empresa.admin()))))
                .isInstanceOf(CaixaConflitoException.class)
                .hasMessage("Termine o fechamento do caixa antes de devolver.");
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    /** Uma venda de uma linha pela operadora, paga inteira na forma informada. */
    private VendaFeita vender(NovoProduto novo, String quantidade, String forma, String total) throws Exception {
        UUID produto = pdv.produto(empresa, novo).id();
        String vendaUuid = vender(empresa.operadora(), item(produto, quantidade), pagamento(forma, total), total);
        long venda = jdbcTemplate.queryForObject("SELECT id FROM vendas WHERE uuid = ?::uuid", Long.class, vendaUuid);
        long item = jdbcTemplate.queryForObject("SELECT id FROM itens_venda WHERE venda_id = ? AND ordem = 1",
                Long.class, venda);
        return new VendaFeita(venda, item, pdv.idDoProduto(produto), produto);
    }

    /**
     * Como o servico da 3b2 vai fazer, numa transacao: a sessao de quem devolve,
     * a devolucao e o item (por JDBC aqui), o estoque e o reembolso.
     */
    private void devolver(VendaFeita venda, Linha linha) {
        naTransacao(() -> {
            SessaoAbertaParaVenda sessao = recebimentosDoCaixa.travarSessaoParaDevolucao(
                    resolvedor.resolver(empresa.admin()));
            long devolucao = jdbcTemplate.queryForObject("""
                    INSERT INTO devolucoes (uuid, empresa_id, venda_id, sessao_caixa_id, usuario_id, motivo, valor,
                                            chave_idempotencia, criada_em)
                    VALUES (gen_random_uuid(), ?, ?, ?, ?, 'Cliente desistiu', ?::numeric, gen_random_uuid(), now())
                    RETURNING id
                    """, Long.class, empresa.id(), venda.venda(), sessao.sessaoId(), empresa.admin(), linha.valor());
            long itemDevolucao = jdbcTemplate.queryForObject("""
                    INSERT INTO itens_devolucao (empresa_id, devolucao_id, venda_id, produto_id, item_venda_id,
                                                 quantidade, quantidade_estoque, valor, destino)
                    VALUES (?, ?, ?, ?, ?, ?::numeric, ?::numeric, ?::numeric, ?)
                    RETURNING id
                    """, Long.class, empresa.id(), devolucao, venda.venda(), venda.produto(), venda.item(),
                    linha.quantidade(), linha.quantidade(), linha.valor(), linha.avariado() ? "AVARIADO" : "ESTOQUE");
            estoqueDaVenda.travarSaldos(empresa.id(), List.of(venda.produto()));
            estoqueDaVenda.devolver(empresa.id(), empresa.admin(), List.of(new DevolucaoDeItem(venda.produto(),
                    venda.item(), itemDevolucao, new BigDecimal(linha.quantidade()), linha.avariado())));
            if (linha.forma() != null) {
                recebimentosDoCaixa.registrarReembolsos(empresa.id(), sessao.sessaoId(), venda.venda(), devolucao,
                        empresa.admin(), List.of(new Reembolso(linha.forma(), new BigDecimal(linha.valor()))));
            }
        });
    }

    /** Fecha o caixa do admin e abre outro com o fundo informado. */
    private UUID trocarCaixaDoAdmin(String fundo) throws Exception {
        cenario.fecharPorJdbc(caixaDoAdmin, empresa.admin());
        caixaDoAdmin = abrirCaixa(empresa.admin(), cenario.novoPonto(empresa.caixa(), "Caixa 3"), fundo);
        return caixaDoAdmin;
    }

    private BigDecimal dinheiroNaGaveta(UUID sessao) {
        return esperado(sessao, "DINHEIRO");
    }

    /** O esperado da forma na sessao, com o sinal de cada tipo (como o caixa calcula). */
    private BigDecimal esperado(UUID sessao, String forma) {
        return jdbcTemplate.queryForObject("""
                SELECT COALESCE(SUM(CASE WHEN tipo IN ('SANGRIA', 'ESTORNO', 'DEVOLUCAO') THEN -valor ELSE valor END), 0)
                FROM movimentos_caixa WHERE sessao_caixa_id = ? AND forma = ?
                """, BigDecimal.class, pdv.idDaSessao(sessao), forma);
    }

    private long contar(String sql) {
        return jdbcTemplate.queryForObject(sql + " AND empresa_id = " + empresa.id(), Long.class);
    }

    private void naTransacao(Runnable acao) {
        new TransactionTemplate(gerenciadorDeTransacoes).executeWithoutResult(status -> acao.run());
    }

    private <T> T comResultado(Supplier<T> acao) {
        return new TransactionTemplate(gerenciadorDeTransacoes).execute(status -> acao.get());
    }
}
