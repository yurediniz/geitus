package com.geitus.app.sales;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Teste de migracao da V19 (devolucao de item; docs/modules/estoque.md,
 * secao 6.2, DEC-046) contra um PostgreSQL real (Testcontainers), sem o
 * contexto Spring.
 *
 * <p>Cada teste parte de um banco limpo no schema da V18 com uma empresa, o
 * vendedor com a sessao da venda e o ADMIN com a sua sessao, e uma venda
 * coerente (recebimento no caixa e baixa no estoque) gravada antes da V19;
 * aplica a V19 e confere as tabelas novas, as extensoes do caixa e do estoque
 * e os gatilhos de integridade.
 *
 * <p>A devolucao e conferida no commit ({@code tg_devolucao_completa},
 * deferida): os atalhos gravam devolucao, itens, reembolsos e estoque numa
 * transacao que termina com {@code SET CONSTRAINTS ALL IMMEDIATE}, para a
 * recusa chegar como {@link DataIntegrityViolationException}. Requer Docker.
 */
@Testcontainers
class MigracaoV19IT {

    private static final String VERSAO_ANTERIOR_A_V19 = "18";
    private static final String VERSAO_V19 = "19";
    private static final AtomicLong NUMERO = new AtomicLong(100);

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private SingleConnectionDataSource conexao;
    private JdbcTemplate jdbc;
    private TransactionTemplate transacao;
    private long empresa;
    private long vendedor;
    private long admin;
    private long sessaoDaVenda;
    private long sessaoDoAdmin;
    private long produto;
    /** Venda de antes da V19: 4 UN a R$ 5,00, paga em dinheiro, com recebimento e baixa. */
    private VendaGravada vendaAntiga;

    private record VendaGravada(long venda, long item) {
    }

    @BeforeEach
    void prepararBancoNaV18ComUmaVenda() {
        Flyway ateV18 = flyway(VERSAO_ANTERIOR_A_V19);
        ateV18.clean();
        ateV18.migrate();
        conexao = new SingleConnectionDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(),
                POSTGRES.getPassword(), true);
        jdbc = new JdbcTemplate(conexao);
        transacao = new TransactionTemplate(new DataSourceTransactionManager(conexao));
        empresa = inserirEmpresa();
        vendedor = inserirUsuario("vendedor", "OPERADOR");
        admin = inserirUsuario("admin", "ADMIN");
        sessaoDaVenda = inserirSessaoAberta("Caixa 1", vendedor);
        sessaoDoAdmin = inserirSessaoAberta("Caixa 2", admin);
        produto = inserirProduto("Arroz");
        entradaDeEstoque("10");
        vendaAntiga = venda("DINHEIRO", "4", "10");
        flyway(VERSAO_V19).migrate();
    }

    @AfterEach
    void fecharConexao() {
        conexao.destroy();
    }

    // ---------- Aceita ----------

    @Test
    void devolucaoNaSessaoDeQuemDevolveVoltaAoEstoqueEReembolsa() {
        long devolucao = devolver(vendaAntiga, "2", "10.00", "ESTOQUE", "DINHEIRO", true);

        assertThat(contar("SELECT count(*) FROM devolucoes WHERE id = " + devolucao + " AND sessao_caixa_id = "
                + sessaoDoAdmin)).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM movimentos_caixa WHERE tipo = 'DEVOLUCAO' AND devolucao_id = "
                + devolucao + " AND sessao_caixa_id = " + sessaoDoAdmin + " AND venda_id = " + vendaAntiga.venda()))
                .isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM movimentos_estoque WHERE origem = 'DEVOLUCAO'"
                + " AND motivo = 'DEVOLUCAO_VENDA' AND quantidade = 2")).isEqualTo(1);
    }

    @Test
    void duasDevolucoesDaMesmaVendaNaMesmaForma() {
        devolver(vendaAntiga, "1", "5.00", "ESTOQUE", "DINHEIRO", true);
        devolver(vendaAntiga, "3", "15.00", "ESTOQUE", "DINHEIRO", true);

        assertThat(contar("SELECT count(*) FROM movimentos_caixa WHERE tipo = 'DEVOLUCAO' AND forma = 'DINHEIRO'"))
                .isEqualTo(2);
        // Tudo devolvido: a terceira passa da quantidade vendida.
        assertViolacao(() -> devolver(vendaAntiga, "1", "0.00", "ESTOQUE", null, true), "maior que a quantidade");
    }

    @Test
    void reembolsoNoPixDeixaOEsperadoDaFormaNegativoNaContagem() {
        VendaGravada noPix = venda("PIX", "2", "6");
        devolver(noPix, "2", "10.00", "ESTOQUE", "PIX", true);

        jdbc.execute(contagemSql(sessaoDoAdmin, "PIX", "-10.00", "0.00"));

        assertThat(contar("SELECT count(*) FROM contagens_caixa WHERE valor_esperado = -10.00")).isEqualTo(1);
        // O contado continua >= 0 (o PIX da sessao da venda espera os 10,00 recebidos).
        assertViolacao(() -> jdbc.execute(contagemSql(sessaoDaVenda, "PIX", "10.00", "-1.00")),
                "ck_contagem_caixa_valores");
    }

    @Test
    void avariadoVoltaOSaldoParaOndeEstavaMesmoNegativo() {
        // Saldo 10 - 4 (venda antiga) - 8 = -2.
        VendaGravada semEstoque = venda("DINHEIRO", "8", "6");
        long devolucao = devolverAvariado(semEstoque, "1", "5.00", "-2");

        assertThat(contar("SELECT count(*) FROM movimentos_estoque m JOIN itens_devolucao d"
                + " ON d.id = m.item_devolucao_id WHERE d.devolucao_id = " + devolucao)).isEqualTo(2);
        assertThat(contar("SELECT count(*) FROM movimentos_estoque WHERE motivo = 'PERDA_AVARIA'"
                + " AND origem = 'DEVOLUCAO' AND saldo_novo = -2")).isEqualTo(1);
    }

    @Test
    void itemQueNaoBaixouEstoqueNaoTemMovimento() {
        VendaGravada semBaixa = vendaSemBaixa("2");

        devolver(semBaixa, "1", "5.00", "ESTOQUE", "DINHEIRO", false);

        assertViolacao(() -> devolver(semBaixa, "1", "5.00", "ESTOQUE", null, true), "não baixou estoque");
    }

    // ---------- Recusa ----------

    @Test
    void devolverMaisQueOVendido() {
        assertViolacao(() -> devolver(vendaAntiga, "5", "25.00", "ESTOQUE", "DINHEIRO", true),
                "maior que a quantidade vendida");
    }

    @Test
    void valorMaiorQueOLiquidoDoItem() {
        assertViolacao(() -> devolver(vendaAntiga, "2", "25.00", "ESTOQUE", "DINHEIRO", true),
                "maior que o valor líquido");
    }

    @Test
    void entradaDiferenteDaQuantidadeDoItem() {
        assertViolacao(() -> emTransacao(() -> {
            long devolucao = inserirDevolucao(vendaAntiga.venda(), "10.00");
            long item = inserirItem(devolucao, vendaAntiga, "2", "10.00", "ESTOQUE");
            jdbc.execute(estoqueDaDevolucaoSql(item, "ENTRADA", "DEVOLUCAO_VENDA", "1", "6"));
        }), "Entrada da devolução diferente");
    }

    @Test
    void reembolsosQueNaoSomamOValor() {
        assertViolacao(() -> emTransacao(() -> {
            long devolucao = inserirDevolucao(vendaAntiga.venda(), "10.00");
            long item = inserirItem(devolucao, vendaAntiga, "2", "10.00", "ESTOQUE");
            jdbc.execute(estoqueDaDevolucaoSql(item, "ENTRADA", "DEVOLUCAO_VENDA", "2", "6"));
            jdbc.execute(reembolsoSql(devolucao, vendaAntiga.venda(), "DINHEIRO", "5.00"));
        }), "Os reembolsos não somam");
    }

    @Test
    void devolucaoSemOMovimentoDeEstoque() {
        assertViolacao(() -> emTransacao(() -> {
            long devolucao = inserirDevolucao(vendaAntiga.venda(), "10.00");
            inserirItem(devolucao, vendaAntiga, "2", "10.00", "ESTOQUE");
            jdbc.execute(reembolsoSql(devolucao, vendaAntiga.venda(), "DINHEIRO", "10.00"));
        }), "sem o movimento de estoque");
    }

    @Test
    void reembolsoNumaFormaQueAVendaNaoRecebeu() {
        assertViolacao(() -> devolver(vendaAntiga, "2", "10.00", "ESTOQUE", "PIX", true),
                "forma que a venda não recebeu");
    }

    @Test
    void reembolsoForaDaSessaoDaDevolucao() {
        assertViolacao(() -> emTransacao(() -> {
            long devolucao = inserirDevolucao(vendaAntiga.venda(), "10.00");
            long item = inserirItem(devolucao, vendaAntiga, "2", "10.00", "ESTOQUE");
            jdbc.execute(estoqueDaDevolucaoSql(item, "ENTRADA", "DEVOLUCAO_VENDA", "2", "6"));
            jdbc.execute(reembolsoSql(devolucao, vendaAntiga.venda(), "DINHEIRO", "10.00")
                    .replace(", " + sessaoDoAdmin + ", 'DEVOLUCAO'", ", " + sessaoDaVenda + ", 'DEVOLUCAO'"));
        }), "fora da sessão da devolução");
    }

    @Test
    void devolucaoDeVendaCancelada() {
        VendaGravada cancelada = venda("DINHEIRO", "1", "10");
        cancelar(cancelada, "5.00");

        assertViolacao(() -> devolver(cancelada, "1", "5.00", "ESTOQUE", "DINHEIRO", true),
                "Devolução só de venda concluída");
    }

    @Test
    void vendaComDevolucaoNaoECancelada() {
        devolver(vendaAntiga, "1", "5.00", "ESTOQUE", "DINHEIRO", true);

        assertViolacao(() -> cancelar(vendaAntiga, "20.00"), "Venda com devolução não pode ser cancelada");
    }

    @Test
    void devolucaoEmSessaoQueNaoEstaAberta() {
        jdbc.update("UPDATE sessoes_caixa SET status = 'EM_CONFERENCIA', fechamento_cego = false,"
                + " valor_esperado = 100.00, valor_contado = 90.00, diferenca = -10.00, contada_por = " + admin
                + ", contada_em = now() WHERE id = " + sessaoDoAdmin);

        assertViolacao(() -> inserirDevolucao(vendaAntiga.venda(), "5.00"), "sessão aberta");
    }

    @Test
    void devolucaoEItensEMovimentosDaDevolucaoSaoImutaveis() {
        long devolucao = devolverAvariado(vendaAntiga, "1", "5.00", "6");

        assertViolacao(() -> jdbc.update("UPDATE devolucoes SET motivo = 'Outro' WHERE id = " + devolucao),
                "Devolução não pode ser alterada");
        assertViolacao(() -> jdbc.update("DELETE FROM itens_devolucao WHERE devolucao_id = " + devolucao),
                "Devolução não pode ser alterada");
        assertViolacao(() -> jdbc.update("DELETE FROM movimentos_estoque WHERE origem = 'DEVOLUCAO'"),
                "Movimento de estoque da devolução");
        assertViolacao(() -> jdbc.update("UPDATE movimentos_caixa SET valor = 1 WHERE tipo = 'DEVOLUCAO'"),
                "não pode ser alterado");
    }

    @Test
    void saidaDoAvariadoSoComDestinoAvariado() {
        assertViolacao(() -> emTransacao(() -> {
            long devolucao = inserirDevolucao(vendaAntiga.venda(), "5.00");
            long item = inserirItem(devolucao, vendaAntiga, "1", "5.00", "ESTOQUE");
            jdbc.execute(estoqueDaDevolucaoSql(item, "ENTRADA", "DEVOLUCAO_VENDA", "1", "6"));
            jdbc.execute(estoqueDaDevolucaoSql(item, "SAIDA", "PERDA_AVARIA", "-1", "7"));
        }), "Saída do avariado");
    }

    @Test
    void motivoDaDevolucaoSoComOrigemDevolucao() {
        assertViolacao(() -> jdbc.execute("INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem,"
                + " quantidade, saldo_anterior, saldo_novo, usuario_id) VALUES (" + empresa + ", " + produto
                + ", 'ENTRADA', 'DEVOLUCAO_VENDA', 'AJUSTE_MANUAL', 1, 6, 7, " + admin + ")"),
                "ck_movimento_estoque_da_devolucao");
    }

    @Test
    void recebimentoContinuaPresoASessaoDaVenda() {
        assertViolacao(() -> jdbc.execute("INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo,"
                + " forma, valor, usuario_id, venda_id, criado_em) VALUES (gen_random_uuid(), " + empresa + ", "
                + sessaoDoAdmin + ", 'RECEBIMENTO', 'DEBITO', 20.00, " + admin + ", " + vendaAntiga.venda()
                + ", now())"), "sessão da venda");
    }

    @Test
    void estornoContinuaPresoASessaoDaVenda() {
        assertViolacao(() -> jdbc.execute("INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo,"
                + " forma, valor, usuario_id, venda_id, criado_em) VALUES (gen_random_uuid(), " + empresa + ", "
                + sessaoDoAdmin + ", 'ESTORNO', 'DINHEIRO', 20.00, " + admin + ", " + vendaAntiga.venda()
                + ", now())"), "sessão da venda");
    }

    @Test
    void devolucaoQueZeraALinhaLevaORestoDoValor() {
        assertViolacao(() -> devolver(vendaAntiga, "4", "15.00", "ESTOQUE", "DINHEIRO", true), "leva o resto");
    }

    @Test
    void devolucaoDeValorZeroVoltaOEstoqueSemReembolso() {
        VendaDeDuasLinhas venda = vendaDeDuasLinhas("0.00");

        long devolucao = devolver(new VendaGravada(venda.venda(), venda.segunda()), "1", "0.00", "ESTOQUE", null, true);

        assertThat(contar("SELECT count(*) FROM movimentos_caixa WHERE devolucao_id = " + devolucao)).isZero();
        assertThat(contar("SELECT count(*) FROM movimentos_estoque m JOIN itens_devolucao d"
                + " ON d.id = m.item_devolucao_id WHERE d.devolucao_id = " + devolucao)).isEqualTo(1);
    }

    @Test
    void reembolsoOuItemGravadoDepoisConfereADevolucaoDeNovo() {
        // Linha 1: 2 UN = R$ 10 (dinheiro); linha 2: 1 UN = R$ 5 (PIX).
        VendaDeDuasLinhas venda = vendaDeDuasLinhas("5.00");
        long devolucao = devolver(new VendaGravada(venda.venda(), venda.primeira()), "1", "5.00", "ESTOQUE",
                "DINHEIRO", true);

        assertViolacao(() -> emTransacao(() -> jdbc.execute(reembolsoSql(devolucao, venda.venda(), "PIX", "5.00"))),
                "Os reembolsos não somam");
        assertViolacao(() -> emTransacao(() -> inserirItem(devolucao, new VendaGravada(venda.venda(),
                venda.segunda()), "1", "5.00", "ESTOQUE")), "não confere com os itens");
    }

    @Test
    void fechaASessaoDeQuemDevolveComOReembolsoEmDinheiroNoEsperado() {
        devolver(vendaAntiga, "2", "10.00", "ESTOQUE", "DINHEIRO", true);

        assertViolacao(() -> jdbc.update(fecharSql(sessaoDoAdmin, "100.00")), "esperado em dinheiro");
        jdbc.update(fecharSql(sessaoDoAdmin, "90.00"));

        assertThat(contar("SELECT count(*) FROM sessoes_caixa WHERE id = " + sessaoDoAdmin + " AND status = 'FECHADA'"))
                .isEqualTo(1);
    }

    @Test
    void nadaDaDevolucaoAtravessaAEmpresa() {
        OutraEmpresa outra = outraEmpresa();
        VendaGravada outraVenda = venda("DINHEIRO", "4", "6");
        long outroProduto = inserirProduto("Feijão", 2);

        // Devolucao de uma venda de outra empresa.
        assertViolacao(() -> inserirDevolucao(outra.venda().venda(), "5.00"), "fk_devolucao_venda");
        // Item de outra venda (da mesma empresa) e de outra empresa.
        assertViolacao(() -> emTransacao(() -> {
            long devolucao = inserirDevolucao(vendaAntiga.venda(), "5.00");
            inserirItem(devolucao, new VendaGravada(vendaAntiga.venda(), outraVenda.item()), "1", "5.00", "ESTOQUE");
        }), "fk_item_devolucao_item_venda");
        assertViolacao(() -> emTransacao(() -> {
            long devolucao = inserirDevolucao(vendaAntiga.venda(), "5.00");
            inserirItem(devolucao, new VendaGravada(vendaAntiga.venda(), outra.venda().item()), "1", "5.00",
                    "ESTOQUE");
        }), "fk_item_devolucao_item_venda");
        // Movimento de estoque de outro produto com o item da devolucao.
        assertViolacao(() -> emTransacao(() -> {
            long devolucao = inserirDevolucao(vendaAntiga.venda(), "5.00");
            long item = inserirItem(devolucao, vendaAntiga, "1", "5.00", "ESTOQUE");
            jdbc.execute(estoqueDaDevolucaoSql(item, "ENTRADA", "DEVOLUCAO_VENDA", "1", "6")
                    .replace(", " + produto + ", 'ENTRADA'", ", " + outroProduto + ", 'ENTRADA'"));
        }), "fk_movimento_estoque_item_devolucao");
        // Reembolso com a devolucao de outra empresa.
        long devolucaoDaOutra = devolucaoNaOutraEmpresa(outra);
        assertViolacao(() -> jdbc.execute(reembolsoSql(devolucaoDaOutra, vendaAntiga.venda(), "DINHEIRO", "5.00")),
                "devolução");
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private record VendaDeDuasLinhas(long venda, long primeira, long segunda) {
    }

    private record OutraEmpresa(long empresa, long usuario, long sessao, long produto, VendaGravada venda) {
    }

    /**
     * Venda de duas linhas na sessao do vendedor, com recebimento e baixa: a
     * primeira de 2 UN = R$ 10,00 paga em dinheiro; a segunda de 1 UN com o
     * liquido informado (R$ 5,00 de bruto, o resto em desconto do item), paga
     * em PIX quando maior que zero.
     */
    private VendaDeDuasLinhas vendaDeDuasLinhas(String liquidoDaSegunda) {
        BigDecimal liquido = new BigDecimal(liquidoDaSegunda);
        BigDecimal total = new BigDecimal("10.00").add(liquido);
        String desconto = new BigDecimal("5.00").subtract(liquido).toPlainString();
        String pagamentos = liquido.signum() > 0
                ? "SELECT %d, v.id, 'DINHEIRO', 10.00 FROM v UNION ALL SELECT %d, v.id, 'PIX', %s FROM v"
                        .formatted(empresa, empresa, liquidoDaSegunda)
                : "SELECT %d, v.id, 'DINHEIRO', 10.00 FROM v".formatted(empresa);
        List<long[]> linhas = jdbc.query("""
                WITH v AS (
                    INSERT INTO vendas (uuid, empresa_id, numero, sessao_caixa_id, usuario_id, status, subtotal,
                                        desconto_itens, desconto_total, total, troco, chave_idempotencia,
                                        concluida_em)
                    VALUES (gen_random_uuid(), %d, %d, %d, %d, 'CONCLUIDA', 15.00, %s, 0, %s, 0, gen_random_uuid(), now())
                    RETURNING id),
                i AS (
                    INSERT INTO itens_venda (empresa_id, venda_id, ordem, produto_id, produto_nome, unidade_sigla,
                                             etiqueta, quantidade, quantidade_estoque, preco_unitario, origem_preco,
                                             valor_bruto, desconto_item, desconto_rateado, valor_liquido)
                    SELECT %d, v.id, 1, %d, 'Arroz', 'UN', false, 2, 2, 5.00, 'NORMAL', 10.00, 0, 0, 10.00 FROM v
                    UNION ALL
                    SELECT %d, v.id, 2, %d, 'Arroz', 'UN', false, 1, 1, 5.00, 'NORMAL', 5.00, %s, 0, %s FROM v
                    RETURNING id, ordem),
                p AS (INSERT INTO pagamentos_venda (empresa_id, venda_id, forma, valor) %s)
                SELECT v.id AS venda, i.id AS item FROM v, i ORDER BY i.ordem
                """.formatted(empresa, NUMERO.incrementAndGet(), sessaoDaVenda, vendedor, desconto, total.toPlainString(),
                empresa, produto, empresa, produto, desconto, liquidoDaSegunda, pagamentos),
                (linha, indice) -> new long[] {linha.getLong("venda"), linha.getLong("item")});
        long venda = linhas.get(0)[0];
        recebimento(sessaoDaVenda, venda, "DINHEIRO", "10.00");
        if (liquido.signum() > 0) {
            recebimento(sessaoDaVenda, venda, "PIX", liquidoDaSegunda);
        }
        BigDecimal anterior = saldo();
        baixa(linhas.get(0)[1], "2", anterior);
        baixa(linhas.get(1)[1], "1", anterior.subtract(new BigDecimal("2")));
        return new VendaDeDuasLinhas(venda, linhas.get(0)[1], linhas.get(1)[1]);
    }

    private void recebimento(long sessao, long venda, String forma, String valor) {
        jdbc.execute("INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, forma, valor, usuario_id,"
                + " venda_id, criado_em) VALUES (gen_random_uuid(), " + empresa + ", " + sessao + ", 'RECEBIMENTO', '"
                + forma + "', " + valor + ", " + vendedor + ", " + venda + ", now())");
    }

    private void baixa(long item, String quantidade, BigDecimal anterior) {
        jdbc.execute("INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,"
                + " saldo_anterior, saldo_novo, usuario_id, item_venda_id) VALUES (" + empresa + ", " + produto
                + ", 'SAIDA', 'VENDA', 'VENDA', -" + quantidade + ", " + anterior + ", " + anterior + " - "
                + quantidade + ", " + vendedor + ", " + item + ")");
        jdbc.update("UPDATE estoque_saldos SET saldo = saldo - ?::numeric WHERE empresa_id = ? AND produto_id = ?",
                quantidade, empresa, produto);
    }

    /** Contagem e fechamento do dinheiro da sessao (sem diferenca) com o esperado informado. */
    private String fecharSql(long sessao, String esperado) {
        return "UPDATE sessoes_caixa SET status = 'FECHADA', fechamento_cego = false, valor_esperado = " + esperado
                + ", valor_contado = " + esperado + ", diferenca = 0, contada_por = " + admin + ", contada_em = now(),"
                + " fechada_por = " + admin + ", fechada_em = now() WHERE id = " + sessao;
    }

    /** Segunda empresa com usuario, sessao aberta, produto e uma venda de 1 UN em dinheiro (sem baixa). */
    private OutraEmpresa outraEmpresa() {
        long outra = jdbc.queryForObject("""
                INSERT INTO empresa (nome, representante_nome, representante_cpf, representante_telefone,
                                     representante_email, telefone, email, tipo_pessoa, endereco_cep,
                                     endereco_logradouro, endereco_numero, endereco_bairro,
                                     endereco_municipio, endereco_uf)
                VALUES ('Outra V19', 'Representante', '11144477735', '11987654321', 'rep@outra.test',
                        '1133224455', 'contato@outra.test', 'FISICA', '01001000', 'Praça da Sé', 'S/N', 'Sé',
                        'São Paulo', 'SP')
                RETURNING id
                """, Long.class);
        jdbc.update("INSERT INTO unidades_medida (empresa_id, sigla, descricao, fracionada) VALUES (?, 'UN', 'Unidade',"
                + " false)", outra);
        long usuario = jdbc.queryForObject("INSERT INTO usuario (empresa_id, nome, email, senha_hash, perfil) VALUES"
                + " (?, 'Outro', 'outro@outra.test', 'hash', 'ADMIN') RETURNING id", Long.class, outra);
        long ponto = jdbc.queryForObject("INSERT INTO pontos_caixa (uuid, empresa_id, nome, criado_em) VALUES"
                + " (gen_random_uuid(), ?, 'Caixa 1', now()) RETURNING id", Long.class, outra);
        long sessao = jdbc.queryForObject("INSERT INTO sessoes_caixa (uuid, empresa_id, ponto_caixa_id, status,"
                + " aberta_por, aberta_em, fundo_troco) VALUES (gen_random_uuid(), ?, ?, 'ABERTA', ?, now(), 0)"
                + " RETURNING id", Long.class, outra, ponto, usuario);
        long produtoDaOutra = jdbc.queryForObject("INSERT INTO produtos (empresa_id, numero, nome, preco_venda,"
                + " unidade_id, busca_normalizada, nome_normalizado) VALUES (?, 1, 'Arroz', 5.00, (SELECT id FROM"
                + " unidades_medida WHERE empresa_id = ?), 'arroz', 'arroz') RETURNING id", Long.class, outra, outra);
        List<VendaGravada> linhas = jdbc.query("""
                WITH v AS (
                    INSERT INTO vendas (uuid, empresa_id, numero, sessao_caixa_id, usuario_id, status, subtotal,
                                        desconto_itens, desconto_total, total, troco, chave_idempotencia,
                                        concluida_em)
                    VALUES (gen_random_uuid(), %d, 1, %d, %d, 'CONCLUIDA', 5.00, 0, 0, 5.00, 0, gen_random_uuid(), now())
                    RETURNING id),
                i AS (
                    INSERT INTO itens_venda (empresa_id, venda_id, ordem, produto_id, produto_nome, unidade_sigla,
                                             etiqueta, quantidade, quantidade_estoque, preco_unitario, origem_preco,
                                             valor_bruto, desconto_item, desconto_rateado, valor_liquido)
                    SELECT %d, v.id, 1, %d, 'Arroz', 'UN', false, 1, 1, 5.00, 'NORMAL', 5.00, 0, 0, 5.00 FROM v
                    RETURNING id),
                p AS (INSERT INTO pagamentos_venda (empresa_id, venda_id, forma, valor) SELECT %d, v.id, 'DINHEIRO', 5.00 FROM v)
                SELECT v.id AS venda, i.id AS item FROM v, i
                """.formatted(outra, sessao, usuario, outra, produtoDaOutra, outra),
                (linha, indice) -> new VendaGravada(linha.getLong("venda"), linha.getLong("item")));
        return new OutraEmpresa(outra, usuario, sessao, produtoDaOutra, linhas.get(0));
    }

    /** Devolucao completa (valor zero, sem estoque nem reembolso) na outra empresa. */
    private long devolucaoNaOutraEmpresa(OutraEmpresa outra) {
        long[] id = new long[1];
        emTransacao(() -> {
            id[0] = jdbc.queryForObject("INSERT INTO devolucoes (uuid, empresa_id, venda_id, sessao_caixa_id,"
                    + " usuario_id, motivo, valor, chave_idempotencia, criada_em) VALUES (gen_random_uuid(), ?, ?, ?, ?,"
                    + " 'Troca', 0, gen_random_uuid(), now()) RETURNING id", Long.class, outra.empresa(),
                    outra.venda().venda(), outra.sessao(), outra.usuario());
            jdbc.update("INSERT INTO itens_devolucao (empresa_id, devolucao_id, venda_id, produto_id, item_venda_id,"
                    + " quantidade, quantidade_estoque, valor, destino) VALUES (?, ?, ?, ?, ?, 0.5, 0.5, 0, 'ESTOQUE')",
                    outra.empresa(), id[0], outra.venda().venda(), outra.produto(), outra.venda().item());
        });
        return id[0];
    }

    /**
     * Devolucao completa de uma linha pelo ADMIN, na sessao dele: o item, a
     * entrada de estoque (se {@code comEstoque}) e o reembolso numa forma (sem
     * reembolso com {@code forma} nula). Devolve o id da devolucao.
     */
    private long devolver(VendaGravada venda, String quantidade, String valor, String destino, String forma,
            boolean comEstoque) {
        long[] id = new long[1];
        emTransacao(() -> {
            id[0] = inserirDevolucao(venda.venda(), valor);
            long item = inserirItem(id[0], venda, quantidade, valor, destino);
            if (comEstoque) {
                BigDecimal anterior = saldo();
                jdbc.execute(estoqueDaDevolucaoSql(item, "ENTRADA", "DEVOLUCAO_VENDA", quantidade,
                        anterior.toPlainString()));
            }
            if (forma != null) {
                jdbc.execute(reembolsoSql(id[0], venda.venda(), forma, valor));
            }
        });
        return id[0];
    }

    /** Devolucao de uma linha como avariado: a entrada e a saida, partindo do saldo informado. */
    private long devolverAvariado(VendaGravada venda, String quantidade, String valor, String saldoAnterior) {
        long[] id = new long[1];
        emTransacao(() -> {
            id[0] = inserirDevolucao(venda.venda(), valor);
            long item = inserirItem(id[0], venda, quantidade, valor, "AVARIADO");
            BigDecimal depoisDaEntrada = new BigDecimal(saldoAnterior).add(new BigDecimal(quantidade));
            jdbc.execute(estoqueDaDevolucaoSql(item, "ENTRADA", "DEVOLUCAO_VENDA", quantidade, saldoAnterior));
            jdbc.execute(estoqueDaDevolucaoSql(item, "SAIDA", "PERDA_AVARIA", "-" + quantidade,
                    depoisDaEntrada.toPlainString()));
            jdbc.execute(reembolsoSql(id[0], venda.venda(), "DINHEIRO", valor));
        });
        return id[0];
    }

    private long inserirDevolucao(long venda, String valor) {
        return jdbc.queryForObject("INSERT INTO devolucoes (uuid, empresa_id, venda_id, sessao_caixa_id, usuario_id,"
                + " motivo, valor, chave_idempotencia, criada_em) VALUES (gen_random_uuid(), ?, ?, ?, ?,"
                + " 'Cliente desistiu', ?::numeric, gen_random_uuid(), now()) RETURNING id", Long.class, empresa,
                venda, sessaoDoAdmin, admin, valor);
    }

    private long inserirItem(long devolucao, VendaGravada venda, String quantidade, String valor, String destino) {
        return jdbc.queryForObject("INSERT INTO itens_devolucao (empresa_id, devolucao_id, venda_id, produto_id,"
                + " item_venda_id, quantidade, quantidade_estoque, valor, destino) VALUES (?, ?, ?, ?, ?, ?::numeric,"
                + " ?::numeric, ?::numeric, ?) RETURNING id", Long.class, empresa, devolucao, venda.venda(), produto,
                venda.item(), quantidade, quantidade, valor, destino);
    }

    private String estoqueDaDevolucaoSql(long itemDevolucao, String tipo, String motivo, String quantidade,
            String anterior) {
        return "INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,"
                + " saldo_anterior, saldo_novo, usuario_id, item_devolucao_id) VALUES (" + empresa + ", " + produto
                + ", '" + tipo + "', '" + motivo + "', 'DEVOLUCAO', " + quantidade + ", " + anterior + ", " + anterior
                + " + (" + quantidade + "), " + admin + ", " + itemDevolucao + ")";
    }

    private String reembolsoSql(long devolucao, long venda, String forma, String valor) {
        return "INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, forma, valor, usuario_id,"
                + " venda_id, devolucao_id, criado_em) VALUES (gen_random_uuid(), " + empresa + ", " + sessaoDoAdmin
                + ", 'DEVOLUCAO', '" + forma + "', " + valor + ", " + admin + ", " + venda + ", " + devolucao
                + ", now())";
    }

    /**
     * Venda coerente de uma linha (R$ 5,00 por UN, sem desconto) na sessao do
     * vendedor, paga inteira na forma, com o recebimento e a baixa de estoque.
     */
    private VendaGravada venda(String forma, String quantidade, String saldoAnterior) {
        VendaGravada gravada = vendaSemBaixa(forma, quantidade);
        jdbc.execute("INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,"
                + " saldo_anterior, saldo_novo, usuario_id, item_venda_id) VALUES (" + empresa + ", " + produto
                + ", 'SAIDA', 'VENDA', 'VENDA', -" + quantidade + ", " + saldoAnterior + ", " + saldoAnterior + " - "
                + quantidade + ", " + vendedor + ", " + gravada.item() + ")");
        jdbc.update("UPDATE estoque_saldos SET saldo = saldo - ?::numeric WHERE empresa_id = ? AND produto_id = ?",
                quantidade, empresa, produto);
        return gravada;
    }

    private VendaGravada vendaSemBaixa(String quantidade) {
        return vendaSemBaixa("DINHEIRO", quantidade);
    }

    private VendaGravada vendaSemBaixa(String forma, String quantidade) {
        String total = new BigDecimal(quantidade).multiply(new BigDecimal("5.00")).toPlainString();
        List<VendaGravada> linhas = jdbc.query("""
                WITH v AS (
                    INSERT INTO vendas (uuid, empresa_id, numero, sessao_caixa_id, usuario_id, status, subtotal,
                                        desconto_itens, desconto_total, total, troco, chave_idempotencia,
                                        concluida_em)
                    VALUES (gen_random_uuid(), %d, %d, %d, %d, 'CONCLUIDA', %s, 0, 0, %s, 0, '%s', now())
                    RETURNING id),
                i AS (
                    INSERT INTO itens_venda (empresa_id, venda_id, ordem, produto_id, produto_nome, unidade_sigla,
                                             etiqueta, quantidade, quantidade_estoque, preco_unitario, origem_preco,
                                             valor_bruto, desconto_item, desconto_rateado, valor_liquido)
                    SELECT %d, v.id, 1, %d, 'Arroz', 'UN', false, %s, %s, 5.00, 'NORMAL', %s, 0, 0, %s FROM v
                    RETURNING id),
                p AS (
                    INSERT INTO pagamentos_venda (empresa_id, venda_id, forma, valor)
                    SELECT %d, v.id, '%s', %s FROM v)
                SELECT v.id AS venda, i.id AS item FROM v, i
                """.formatted(empresa, NUMERO.incrementAndGet(), sessaoDaVenda, vendedor, total, total,
                UUID.randomUUID(), empresa, produto, quantidade, quantidade, total, total, empresa, forma, total),
                (linha, indice) -> new VendaGravada(linha.getLong("venda"), linha.getLong("item")));
        VendaGravada gravada = linhas.get(0);
        jdbc.execute("INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, forma, valor, usuario_id,"
                + " venda_id, criado_em) VALUES (gen_random_uuid(), " + empresa + ", " + sessaoDaVenda
                + ", 'RECEBIMENTO', '" + forma + "', " + total + ", " + vendedor + ", " + gravada.venda()
                + ", now())");
        return gravada;
    }

    /** Cancela pela regra da V17: o estorno do recebimento e da baixa, na sessao da venda. */
    private void cancelar(VendaGravada venda, String valorRecebido) {
        emTransacao(() -> {
            jdbc.update("UPDATE vendas SET status = 'CANCELADA', cancelada_por = ?, cancelada_em = now(),"
                    + " motivo_cancelamento = 'Desistiu' WHERE id = ?", vendedor, venda.venda());
            jdbc.execute("INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, forma, valor,"
                    + " usuario_id, venda_id, criado_em) VALUES (gen_random_uuid(), " + empresa + ", "
                    + sessaoDaVenda + ", 'ESTORNO', 'DINHEIRO', " + valorRecebido + ", " + vendedor + ", "
                    + venda.venda() + ", now())");
            BigDecimal baixa = jdbc.queryForObject("SELECT -quantidade FROM movimentos_estoque WHERE item_venda_id = ?"
                    + " AND motivo = 'VENDA'", BigDecimal.class, venda.item());
            BigDecimal anterior = saldo();
            jdbc.execute("INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,"
                    + " saldo_anterior, saldo_novo, usuario_id, item_venda_id) VALUES (" + empresa + ", " + produto
                    + ", 'ENTRADA', 'CANCELAMENTO_VENDA', 'VENDA', " + baixa + ", " + anterior + ", " + anterior
                    + " + " + baixa + ", " + vendedor + ", " + venda.item() + ")");
        });
    }

    /** Roda os comandos numa transacao e confere as constraints deferidas antes do commit. */
    private void emTransacao(Runnable comandos) {
        transacao.executeWithoutResult(status -> {
            comandos.run();
            jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
        });
    }

    private BigDecimal saldo() {
        return jdbc.queryForObject("SELECT saldo FROM estoque_saldos WHERE empresa_id = ? AND produto_id = ?",
                BigDecimal.class, empresa, produto);
    }

    private String contagemSql(long sessao, String forma, String esperado, String contado) {
        return "INSERT INTO contagens_caixa (empresa_id, sessao_caixa_id, forma, valor_esperado, valor_contado,"
                + " diferenca) VALUES (" + empresa + ", " + sessao + ", '" + forma + "', " + esperado + ", "
                + contado + ", " + contado + " - (" + esperado + "))";
    }

    private void assertViolacao(Runnable acao, String trechoDaMensagem) {
        assertThatThrownBy(acao::run)
                .as("violacao (%s)", trechoDaMensagem)
                .isInstanceOf(DataIntegrityViolationException.class)
                .satisfies(erro -> assertThat(((DataIntegrityViolationException) erro).getMostSpecificCause()
                        .getMessage()).contains(trechoDaMensagem));
    }

    private long contar(String sql) {
        return jdbc.queryForObject(sql, Long.class);
    }

    private static Flyway flyway(String versaoAlvo) {
        return Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .cleanDisabled(false)
                .target(versaoAlvo)
                .load();
    }

    /** Empresa FISICA com as colunas NOT NULL da V3 e a unidade UN. */
    private long inserirEmpresa() {
        long id = jdbc.queryForObject("""
                INSERT INTO empresa (nome, representante_nome, representante_cpf, representante_telefone,
                                     representante_email, telefone, email, tipo_pessoa, endereco_cep,
                                     endereco_logradouro, endereco_numero, endereco_bairro,
                                     endereco_municipio, endereco_uf)
                VALUES ('Empresa V19', 'Representante', '11144477735', '11987654321', 'rep@v19.test',
                        '1133224455', 'contato@v19.test', 'FISICA', '01001000', 'Praça da Sé', 'S/N', 'Sé',
                        'São Paulo', 'SP')
                RETURNING id
                """, Long.class);
        jdbc.update("INSERT INTO unidades_medida (empresa_id, sigla, descricao, fracionada) VALUES (?, 'UN', 'Unidade',"
                + " false)", id);
        return id;
    }

    private long inserirUsuario(String apelido, String perfil) {
        return jdbc.queryForObject("""
                INSERT INTO usuario (empresa_id, nome, email, senha_hash, perfil)
                VALUES (?, ?, ?, 'hash-irrelevante', ?)
                RETURNING id
                """, Long.class, empresa, "Usuario " + apelido, apelido + "@v19.test", perfil);
    }

    /** Sessao aberta com a abertura de R$ 100,00 em dinheiro. */
    private long inserirSessaoAberta(String ponto, long usuario) {
        long pontoId = jdbc.queryForObject("INSERT INTO pontos_caixa (uuid, empresa_id, nome, criado_em) VALUES"
                + " (gen_random_uuid(), ?, ?, now()) RETURNING id", Long.class, empresa, ponto);
        long sessao = jdbc.queryForObject("INSERT INTO sessoes_caixa (uuid, empresa_id, ponto_caixa_id, status,"
                + " aberta_por, aberta_em, fundo_troco) VALUES (gen_random_uuid(), ?, ?, 'ABERTA', ?, now(), 100.00)"
                + " RETURNING id", Long.class, empresa, pontoId, usuario);
        jdbc.update("INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, forma, valor, usuario_id,"
                + " chave_idempotencia, criado_em) VALUES (gen_random_uuid(), ?, ?, 'ABERTURA', 'DINHEIRO', 100.00, ?,"
                + " gen_random_uuid(), now())", empresa, sessao, usuario);
        return sessao;
    }

    private long inserirProduto(String nome) {
        return inserirProduto(nome, 1);
    }

    private long inserirProduto(String nome, long numero) {
        return jdbc.queryForObject("""
                INSERT INTO produtos (empresa_id, numero, nome, preco_venda, unidade_id, busca_normalizada,
                                      nome_normalizado)
                VALUES (?, ?, ?, 5.00, (SELECT id FROM unidades_medida WHERE empresa_id = ? AND sigla = 'UN'),
                        lower(?), lower(?))
                RETURNING id
                """, Long.class, empresa, numero, nome, empresa, nome, nome);
    }

    private void entradaDeEstoque(String quantidade) {
        jdbc.update("INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,"
                + " saldo_anterior, saldo_novo, usuario_id) VALUES (?, ?, 'ENTRADA', 'OUTRO', 'AJUSTE_MANUAL', ?::numeric,"
                + " 0, ?::numeric, ?)", empresa, produto, quantidade, quantidade, admin);
        jdbc.update("INSERT INTO estoque_saldos (empresa_id, produto_id, saldo) VALUES (?, ?, ?::numeric)", empresa,
                produto, quantidade);
    }
}
