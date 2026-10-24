package com.geitus.app.sales;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Teste de migracao da V17 (PDV, DEC-042) contra um PostgreSQL real
 * (Testcontainers), sem o contexto Spring.
 *
 * <p>Cada teste parte de um banco limpo no schema da V16 com duas empresas,
 * um usuario em cada, uma sessao aberta com abertura, suprimento e sangria,
 * uma sessao em conferencia e outra fechada com diferenca, e um produto com
 * saldo; aplica a V17 e confere a carga ({@code DINHEIRO} nos movimentos
 * atuais), os {@code CHECK}, as FKs compostas e os gatilhos de vendas, itens,
 * pagamentos, contagens por forma, estornos e da conferencia
 * (docs/modules/pdv.md, 4 e 8).
 *
 * <p>A venda e conferida no commit ({@code tg_venda_coerente}, deferida): os
 * atalhos gravam a venda, os itens e o pagamento num comando so. Constraints e
 * gatilhos (SQLSTATE 23000) chegam como {@link DataIntegrityViolationException}.
 * Requer Docker.
 */
@Testcontainers
class MigracaoV17IT {

    private static final String VERSAO_ANTERIOR_A_V17 = "16";
    private static final String VERSAO_V17 = "17";
    private static final BigDecimal PRECO = new BigDecimal("5.00");
    private static final AtomicLong NUMERO = new AtomicLong(100);

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private SingleConnectionDataSource conexao;
    private JdbcTemplate jdbc;
    private long empresaA;
    private long empresaB;
    private long usuarioA;
    private long usuarioB;
    private long sessaoA;
    private long sessaoEmConferencia;
    private long produtoA;
    private long produtoB;

    @BeforeEach
    void prepararBancoNaV16ComDados() {
        Flyway ateV16 = flyway(VERSAO_ANTERIOR_A_V17);
        ateV16.clean();
        ateV16.migrate();
        conexao = new SingleConnectionDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(),
                POSTGRES.getPassword(), true);
        jdbc = new JdbcTemplate(conexao);
        empresaA = inserirEmpresa("Empresa A");
        empresaB = inserirEmpresa("Empresa B");
        usuarioA = inserirUsuario(empresaA, "a");
        usuarioB = inserirUsuario(empresaB, "b");
        sessaoA = inserirSessaoAberta(empresaA, "Caixa 1", usuarioA);
        inserirMovimentoDeGaveta(empresaA, sessaoA, usuarioA, "ABERTURA", "100.00", null);
        inserirMovimentoDeGaveta(empresaA, sessaoA, usuarioA, "SUPRIMENTO", "10.00", "'Troco'");
        inserirMovimentoDeGaveta(empresaA, sessaoA, usuarioA, "SANGRIA", "5.00", "'Cofre'");
        semearSessoesContadas();
        produtoA = inserirProduto(empresaA, "Arroz");
        produtoB = inserirProduto(empresaB, "Arroz B");
        inserirEntradaDeEstoque(empresaA, produtoA, usuarioA, "5");
        flyway(VERSAO_V17).migrate();
    }

    /** Antes da V17: uma sessao EM_CONFERENCIA (empresa B) e uma FECHADA com diferenca e justificativa (empresa A). */
    private void semearSessoesContadas() {
        long usuarioB2 = inserirUsuario(empresaB, "b2");
        sessaoEmConferencia = inserirSessaoAberta(empresaB, "Caixa 2", usuarioB2);
        inserirMovimentoDeGaveta(empresaB, sessaoEmConferencia, usuarioB2, "ABERTURA", "50.00", null);
        jdbc.update("UPDATE sessoes_caixa SET status = 'EM_CONFERENCIA', fechamento_cego = true, valor_esperado = 50,"
                + " valor_contado = 45, diferenca = -5, contada_por = " + usuarioB2 + ", contada_em = now()"
                + " WHERE id = " + sessaoEmConferencia);
        long usuarioA2 = inserirUsuario(empresaA, "a2");
        long fechada = inserirSessaoAberta(empresaA, "Caixa 2", usuarioA2);
        inserirMovimentoDeGaveta(empresaA, fechada, usuarioA2, "ABERTURA", "20.00", null);
        jdbc.update("UPDATE sessoes_caixa SET status = 'FECHADA', fechamento_cego = false, valor_esperado = 20,"
                + " valor_contado = 18, diferenca = -2, contada_por = " + usuarioA2 + ", contada_em = now(),"
                + " justificativa = 'Falta', fechada_por = " + usuarioA2 + ", fechada_em = now() WHERE id = "
                + fechada);
    }

    @AfterEach
    void fecharConexao() {
        conexao.destroy();
    }

    // ---------- Caixa: forma nos movimentos ----------

    @Test
    void movimentosAtuaisViramDinheiro() {
        assertThat(contar("SELECT count(*) FROM movimentos_caixa WHERE forma = 'DINHEIRO' AND venda_id IS NULL"))
                .isEqualTo(5);
        assertThat(contar("SELECT count(*) FROM movimentos_caixa WHERE forma <> 'DINHEIRO'")).isZero();
        String padrao = jdbc.queryForObject("SELECT column_default FROM information_schema.columns"
                + " WHERE table_name = 'movimentos_caixa' AND column_name = 'forma'", String.class);
        assertThat(padrao).isNull();
    }

    /** DADOS-S7: as sessoes contadas antes da V17 continuam validas e a em conferencia fecha. */
    @Test
    void sessoesContadasAntesDaV17ContinuamValidas() {
        assertThat(contar("SELECT count(*) FROM sessoes_caixa WHERE status = 'EM_CONFERENCIA'")).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM sessoes_caixa WHERE status = 'FECHADA' AND diferenca <> 0"))
                .isEqualTo(1);

        assertViolacao("UPDATE sessoes_caixa SET status = 'FECHADA', fechada_por = contada_por, fechada_em = now()"
                + " WHERE id = " + sessaoEmConferencia, "justificativa");
        jdbc.update("UPDATE sessoes_caixa SET status = 'FECHADA', justificativa = 'Troco errado',"
                + " fechada_por = contada_por, fechada_em = now() WHERE id = " + sessaoEmConferencia);
        assertThat(contar("SELECT count(*) FROM sessoes_caixa WHERE status = 'EM_CONFERENCIA'")).isZero();
    }

    /** DADOS-S7: a sessao aberta antes da V17 fecha pelo contrato novo (so dinheiro, esperado dos movimentos). */
    @Test
    void sessaoAbertaAntesDaV17FechaPeloContratoNovo() {
        assertViolacao(contarDinheiroSql(sessaoA, "FECHADA", false, "100.00").replace("valor_esperado = 105.00",
                "valor_esperado = 100.00").replace("diferenca = 100.00 - 105.00", "diferenca = 0"),
                "esperado em dinheiro");

        jdbc.update(contarDinheiroSql(sessaoA, "FECHADA", true, "105.00"));

        assertThat(contar("SELECT count(*) FROM sessoes_caixa WHERE id = " + sessaoA + " AND status = 'FECHADA'"))
                .isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM contagens_caixa")).isZero();
    }

    @Test
    void recebimentoExigeVendaEValorPositivo() {
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "10.00");

        assertViolacao(movimentoDaVendaSql(sessaoA, null, "RECEBIMENTO", "DEBITO", "10.00"),
                "ck_movimento_caixa_da_venda");
        assertViolacao(movimentoDaVendaSql(sessaoA, venda, "RECEBIMENTO", "DEBITO", "0.00"),
                "ck_movimento_caixa_valor");
        assertViolacao("INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, forma, valor, motivo,"
                + " usuario_id, venda_id, criado_em) VALUES (gen_random_uuid(), " + empresaA + ", " + sessaoA
                + ", 'RECEBIMENTO', 'PIX', 10.00, 'Venda', " + usuarioA + ", " + venda + ", now())",
                "ck_movimento_caixa_motivo");
        jdbc.update(movimentoDaVendaSql(sessaoA, venda, "RECEBIMENTO", "DEBITO", "10.00"));

        assertViolacao(movimentoDaVendaSql(sessaoA, venda, "RECEBIMENTO", "DEBITO", "10.00"),
                "uq_movimento_caixa_venda");
        assertViolacao(movimentoDaVendaSql(sessaoA, venda, "RECEBIMENTO", "VALE", "10.00"),
                "ck_movimento_caixa_forma");
    }

    @Test
    void aberturaSangriaSuprimentoSoEmDinheiro() {
        assertViolacao("INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, forma, valor, motivo,"
                + " usuario_id, chave_idempotencia, criado_em) VALUES (gen_random_uuid(), " + empresaA + ", "
                + sessaoA + ", 'SANGRIA', 'PIX', 1.00, 'Cofre', " + usuarioA + ", gen_random_uuid(), now())",
                "ck_movimento_caixa_da_gaveta");
        assertViolacao("INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, forma, valor, motivo,"
                + " usuario_id, criado_em) VALUES (gen_random_uuid(), " + empresaA + ", " + sessaoA
                + ", 'SUPRIMENTO', 'DINHEIRO', 1.00, 'Troco', " + usuarioA + ", now())",
                "ck_movimento_caixa_da_gaveta");
    }

    /** DADOS-I3: o estorno de caixa devolve so o que a venda recebeu, na mesma forma e valor. */
    @Test
    void estornoDeCaixaPresoAoRecebimento() {
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "20.00");

        assertViolacao(movimentoDaVendaSql(sessaoA, venda, "ESTORNO", "PIX", "20.00"), "recebimento");
        jdbc.update(movimentoDaVendaSql(sessaoA, venda, "RECEBIMENTO", "PIX", "20.00"));
        assertViolacao(movimentoDaVendaSql(sessaoA, venda, "ESTORNO", "PIX", "15.00"), "recebimento");
        assertViolacao(movimentoDaVendaSql(sessaoA, venda, "ESTORNO", "DINHEIRO", "20.00"), "recebimento");

        jdbc.update(movimentoDaVendaSql(sessaoA, venda, "ESTORNO", "PIX", "20.00"));
        assertViolacao(movimentoDaVendaSql(sessaoA, venda, "ESTORNO", "PIX", "20.00"), "uq_movimento_caixa_venda");
    }

    // ---------- Vendas ----------

    @Test
    void vendaSoMudaDeConcluidaParaCancelada() {
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "10.00");

        assertViolacao("UPDATE vendas SET total = 9, subtotal = 9 WHERE id = " + venda, "Venda");
        assertViolacao("DELETE FROM vendas WHERE id = " + venda, "Venda");
        assertViolacao(cancelarSql(venda, "  "), "ck_venda_cancelamento");

        jdbc.update(cancelarSql(venda, "Cliente desistiu"));

        assertViolacao("UPDATE vendas SET status = 'CONCLUIDA', cancelada_por = NULL, cancelada_em = NULL,"
                + " motivo_cancelamento = NULL WHERE id = " + venda, "Venda");
        assertViolacao(cancelarSql(venda, "Outro motivo"), "Venda");
    }

    @Test
    void vendaNasceConcluidaESoEmSessaoAberta() {
        assertViolacao(vendaSql(empresaA, sessaoA, usuarioA, "10.00", "'CANCELADA'", UUID.randomUUID(), 99),
                "Venda");
        fecharSessaoSemDiferenca(sessaoA);

        assertViolacao(vendaSql(empresaA, sessaoA, usuarioA, "10.00", "'CONCLUIDA'", UUID.randomUUID(), 98),
                "sessão aberta");
    }

    /** DADOS-I2: venda, itens e pagamentos somam os totais no commit. */
    @Test
    void vendaIncoerenteRecusadaNoCommit() {
        assertViolacao(vendaSql(empresaA, sessaoA, usuarioA, "10.00", "'CONCLUIDA'", UUID.randomUUID(), 1),
                "incoerente");
        assertViolacao(vendaComUmItemSql(new BigDecimal("10.00"), new BigDecimal("9.00"), "'DINHEIRO', 10.00", "0"),
                "incoerente");
        assertViolacao(vendaComUmItemSql(new BigDecimal("10.00"), new BigDecimal("10.00"), "'DINHEIRO', 9.00", "0"),
                "incoerente");
        assertViolacao(vendaComUmItemSql(new BigDecimal("10.00"), new BigDecimal("10.00"), "'PIX', 15.00", "5"),
                "incoerente");

        jdbc.queryForObject(vendaComUmItemSql(new BigDecimal("10.00"), new BigDecimal("10.00"),
                "'DINHEIRO', 15.00", "5"), Long.class);
        assertThat(contar("SELECT count(*) FROM vendas")).isEqualTo(1);
    }

    @Test
    void itemEPagamentoImutaveis() {
        long[] venda = vendaCoerente(empresaA, sessaoA, usuarioA, produtoA, UUID.randomUUID(), NUMERO.incrementAndGet(),
                "2");
        long item = venda[1];

        assertViolacao("UPDATE itens_venda SET produto_nome = 'Outro' WHERE id = " + item, "Item");
        assertViolacao("DELETE FROM itens_venda WHERE id = " + item, "Item");
        assertViolacao("UPDATE pagamentos_venda SET valor = 1 WHERE venda_id = " + venda[0], "Pagamento");
        assertViolacao("DELETE FROM pagamentos_venda WHERE venda_id = " + venda[0], "Pagamento");
        assertViolacao("INSERT INTO pagamentos_venda (empresa_id, venda_id, forma, valor) VALUES (" + empresaA + ", "
                + venda[0] + ", 'DINHEIRO', 5.00)", "uq_pagamento_venda_forma");
        assertViolacao("INSERT INTO pagamentos_venda (empresa_id, venda_id, forma, valor) VALUES (" + empresaA + ", "
                + venda[0] + ", 'PIX', 0)", "ck_pagamento_venda_valor");
    }

    @Test
    void totalIncoerenteRecusado() {
        assertViolacao("INSERT INTO vendas (uuid, empresa_id, numero, sessao_caixa_id, usuario_id, status, subtotal,"
                + " desconto_itens, desconto_total, total, troco, chave_idempotencia, concluida_em) VALUES"
                + " (gen_random_uuid(), " + empresaA + ", 1, " + sessaoA + ", " + usuarioA + ", 'CONCLUIDA', 10.00,"
                + " 1.00, 1.00, 9.00, 0, gen_random_uuid(), now())", "ck_venda_total");
        assertViolacao(vendaSql(empresaA, sessaoA, usuarioA, "0.00", "'CONCLUIDA'", UUID.randomUUID(), 2),
                "ck_venda_valores");
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "10.00");
        assertViolacao(itemSql(venda, 2, "2.000", "2.000", "10.00", "1.00", "0.00", "8.00", null, null),
                "ck_item_venda_liquido");
        assertViolacao(itemSql(venda, 2, "2.000", "3.000", "10.00", "0.00", "0.00", "10.00", null, null),
                "ck_item_venda_quantidade_estoque");
        assertViolacao(itemSql(venda, 2, "1.500", "4.500", "10.00", "0.00", "0.00", "10.00", "'CX c/ 3 UN'",
                "3.000"), "ck_item_venda_embalagem");
    }

    @Test
    void cancelamentoIncoerenteRecusado() {
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "10.00");

        assertViolacao("UPDATE vendas SET status = 'CANCELADA' WHERE id = " + venda, "ck_venda_cancelamento");
        assertViolacao("UPDATE vendas SET status = 'CANCELADA', cancelada_por = " + usuarioA
                + ", cancelada_em = now(), motivo_cancelamento = ' Desistiu' WHERE id = " + venda,
                "ck_venda_cancelamento");
    }

    @Test
    void chaveRepetidaNaEmpresaRecusada() {
        UUID chave = UUID.randomUUID();
        vendaCoerente(empresaA, sessaoA, usuarioA, produtoA, chave, 1, "2");

        assertViolacao(vendaCoerenteSql(empresaA, sessaoA, usuarioA, produtoA, chave, 2, "2"), "uq_venda_chave");
    }

    @Test
    void numeroRepetidoNaEmpresaRecusado() {
        vendaCoerente(empresaA, sessaoA, usuarioA, produtoA, UUID.randomUUID(), 7, "2");

        assertViolacao(vendaCoerenteSql(empresaA, sessaoA, usuarioA, produtoA, UUID.randomUUID(), 7, "2"),
                "uq_venda_numero");
        jdbc.update("INSERT INTO numeracoes (empresa_id, tipo, ultimo_numero) VALUES (" + empresaA + ", 'VENDA', 7)");
    }

    /** DADOS-S1: a venda so entra na sessao aberta pelo vendedor. */
    @Test
    void vendedorEODonoDaSessao() {
        long outroDaEmpresa = inserirUsuario(empresaA, "a3");

        assertViolacao(vendaCoerenteSql(empresaA, sessaoA, outroDaEmpresa, produtoA, UUID.randomUUID(),
                NUMERO.incrementAndGet(), "2"), "fk_venda_sessao_do_vendedor");
    }

    // ---------- Estoque ----------

    @Test
    void saldoNegativoSoComMotivoVenda() {
        assertViolacao(movimentoDeEstoqueSql(produtoA, "AJUSTE", "CONTAGEM", "AJUSTE_MANUAL", "-6", "5", null),
                "ck_movimento_estoque_saldo_nao_negativo_fora_da_venda");
        assertViolacao(movimentoDeEstoqueSql(produtoA, "SAIDA", "PERDA_AVARIA", "AJUSTE_MANUAL", "-6", "5", null),
                "ck_movimento_estoque_saldo_nao_negativo_fora_da_venda");

        long item = vendaCoerente(empresaA, sessaoA, usuarioA, produtoA, UUID.randomUUID(), NUMERO.incrementAndGet(),
                "6")[1];
        jdbc.update(movimentoDeEstoqueSql(produtoA, "SAIDA", "VENDA", "VENDA", "-6", "5", item));
        jdbc.update("UPDATE estoque_saldos SET saldo = -1 WHERE produto_id = " + produtoA);

        // Entrada a partir de saldo negativo continua aceita (ainda negativa).
        jdbc.update("INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,"
                + " saldo_anterior, saldo_novo, usuario_id, custo_informado, custo_unitario) VALUES (" + empresaA
                + ", " + produtoA + ", 'ENTRADA', 'OUTRO', 'AJUSTE_MANUAL', 0.5, -1, -0.5, " + usuarioA
                + ", NULL, NULL)");
        assertThat(contar("SELECT count(*) FROM estoque_saldos WHERE saldo < 0")).isEqualTo(1);
    }

    @Test
    void estornoDeEstoqueUnicoPorItem() {
        long[] venda = vendaCoerente(empresaA, sessaoA, usuarioA, produtoA, UUID.randomUUID(),
                NUMERO.incrementAndGet(), "2", "1");
        long item = venda[1];
        jdbc.update(movimentoDeEstoqueSql(produtoA, "SAIDA", "VENDA", "VENDA", "-2", "5", item));
        jdbc.update(movimentoDeEstoqueSql(produtoA, "ENTRADA", "CANCELAMENTO_VENDA", "VENDA", "2", "3", item));

        assertViolacao(movimentoDeEstoqueSql(produtoA, "ENTRADA", "CANCELAMENTO_VENDA", "VENDA", "2", "5", item),
                "uq_movimento_estoque_item_venda");
        assertViolacao(movimentoDeEstoqueSql(produtoA, "SAIDA", "VENDA", "VENDA", "-2", "7", null),
                "ck_movimento_estoque_da_venda");
        assertViolacao(movimentoDeEstoqueSql(produtoA, "SAIDA", "CANCELAMENTO_VENDA", "VENDA", "-2", "7", item),
                "ck_movimento_estoque_motivo_do_tipo");
        long outroProduto = inserirProduto(empresaA, "Feijao");
        assertViolacao(movimentoDeEstoqueSql(outroProduto, "SAIDA", "VENDA", "VENDA", "-1", "0", venda[2]),
                "fk_movimento_estoque_item_venda");
    }

    /** DADOS-I3: o estorno de estoque devolve exatamente o que a baixa do item tirou. */
    @Test
    void estornoDeEstoquePresoABaixa() {
        long[] venda = vendaCoerente(empresaA, sessaoA, usuarioA, produtoA, UUID.randomUUID(),
                NUMERO.incrementAndGet(), "2", "1");

        assertViolacao(movimentoDeEstoqueSql(produtoA, "ENTRADA", "CANCELAMENTO_VENDA", "VENDA", "2", "5", venda[1]),
                "baixa");
        jdbc.update(movimentoDeEstoqueSql(produtoA, "SAIDA", "VENDA", "VENDA", "-2", "5", venda[1]));
        assertViolacao(movimentoDeEstoqueSql(produtoA, "ENTRADA", "CANCELAMENTO_VENDA", "VENDA", "1", "3", venda[1]),
                "baixa");
    }

    // ---------- Contagem por forma e conferencia ----------

    @Test
    void contagemPorFormaImutavelEUnica() {
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "20.00");
        jdbc.update(movimentoDaVendaSql(sessaoA, venda, "RECEBIMENTO", "DEBITO", "20.00"));
        jdbc.update(contagemSql(sessaoA, "DEBITO", "20.00", "20.00"));

        assertViolacao(contagemSql(sessaoA, "DEBITO", "20.00", "20.00"), "uq_contagem_caixa_forma");
        assertViolacao("UPDATE contagens_caixa SET valor_contado = 1, diferenca = -19 WHERE sessao_caixa_id = "
                + sessaoA, "Contagem");
        assertViolacao("DELETE FROM contagens_caixa WHERE sessao_caixa_id = " + sessaoA, "Contagem");
        assertViolacao(contagemSql(sessaoA, "DINHEIRO", "105.00", "105.00"), "ck_contagem_caixa_forma");
        assertViolacao(contagemSql(sessaoA, "PIX", "0.00", "0.00"), "movimento");
        assertViolacao(contagemSql(sessaoA, "CREDITO", "1.00", "1.00"), "movimento");
    }

    @Test
    void contagemComEsperadoDiferenteDosMovimentosRecusada() {
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "20.00");
        jdbc.update(movimentoDaVendaSql(sessaoA, venda, "RECEBIMENTO", "PIX", "20.00"));

        assertViolacao(contagemSql(sessaoA, "PIX", "15.00", "15.00"), "esperado");
    }

    @Test
    void emConferenciaComDiferencaSoNoCartaoAceita() {
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "20.00");
        jdbc.update(movimentoDaVendaSql(sessaoA, venda, "RECEBIMENTO", "DEBITO", "20.00"));
        jdbc.update(contagemSql(sessaoA, "DEBITO", "20.00", "15.00"));

        jdbc.update(contarDinheiroSql(sessaoA, "EM_CONFERENCIA", true, "105.00"));

        assertThat(contar("SELECT count(*) FROM sessoes_caixa WHERE status = 'EM_CONFERENCIA'")).isEqualTo(2);
    }

    @Test
    void emConferenciaSemDiferencaEmNenhumaFormaRecusada() {
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "20.00");
        jdbc.update(movimentoDaVendaSql(sessaoA, venda, "RECEBIMENTO", "DEBITO", "20.00"));
        jdbc.update(contagemSql(sessaoA, "DEBITO", "20.00", "20.00"));

        assertViolacao(contarDinheiroSql(sessaoA, "EM_CONFERENCIA", true, "105.00"), "diferença");
    }

    @Test
    void fechadaComDiferencaNoCartaoSemJustificativaRecusada() {
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "20.00");
        jdbc.update(movimentoDaVendaSql(sessaoA, venda, "RECEBIMENTO", "DEBITO", "20.00"));
        jdbc.update(contagemSql(sessaoA, "DEBITO", "20.00", "15.00"));

        assertViolacao(contarDinheiroSql(sessaoA, "FECHADA", false, "105.00"), "justificativa");
        assertViolacao(contarDinheiroSql(sessaoA, "FECHADA", true, "105.00").replace("justificativa = NULL",
                "justificativa = 'Falta no cartão'"), "conferência");
        jdbc.update(contarDinheiroSql(sessaoA, "FECHADA", false, "105.00").replace("justificativa = NULL",
                "justificativa = 'Falta no cartão'"));
    }

    @Test
    void fechamentoSemContarFormaComMovimentoRecusado() {
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "20.00");
        jdbc.update(movimentoDaVendaSql(sessaoA, venda, "RECEBIMENTO", "CREDITO", "20.00"));

        assertViolacao(contarDinheiroSql(sessaoA, "FECHADA", false, "105.00"), "Conte");
    }

    /** DADOS-I1: ao sair de ABERTA, o esperado gravado confere com os movimentos (dinheiro e cada forma). */
    @Test
    void esperadoDaContagemConferidoNaSaidaDeAberta() {
        assertViolacao(contarDinheiroSql(sessaoA, "FECHADA", false, "110.00").replace("valor_esperado = 105.00",
                "valor_esperado = 110.00").replace("diferenca = 110.00 - 105.00", "diferenca = 0"),
                "esperado em dinheiro");

        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "20.00");
        jdbc.update(movimentoDaVendaSql(sessaoA, venda, "RECEBIMENTO", "PIX", "20.00"));
        jdbc.update(contagemSql(sessaoA, "PIX", "20.00", "20.00"));
        jdbc.update(movimentoDaVendaSql(sessaoA, venda, "ESTORNO", "PIX", "20.00"));

        assertViolacao(contarDinheiroSql(sessaoA, "FECHADA", true, "105.00"), "esperado de uma forma");
    }

    // ---------- Integridade entre empresas ----------

    @Test
    void fksDeOutraEmpresaRecusadas() {
        long sessaoB = inserirSessaoAberta(empresaB, "Caixa 1", usuarioB);
        long clienteB = inserirCliente(empresaB, "Cliente B");

        assertViolacao(vendaSql(empresaB, sessaoA, usuarioB, "10.00", "'CONCLUIDA'", UUID.randomUUID(), 1),
                "fk_venda_sessao");
        assertViolacao("INSERT INTO vendas (uuid, empresa_id, numero, sessao_caixa_id, usuario_id, cliente_id,"
                + " cliente_nome, status, subtotal, desconto_itens, desconto_total, total, troco,"
                + " chave_idempotencia, concluida_em) VALUES (gen_random_uuid(), " + empresaA + ", 1, " + sessaoA
                + ", " + usuarioA + ", " + clienteB + ", 'Cliente B', 'CONCLUIDA', 10, 0, 0, 10, 0,"
                + " gen_random_uuid(), now())", "fk_venda_cliente");
        long vendaB = vendaCoerente(empresaB, sessaoB, usuarioB, produtoB, UUID.randomUUID(),
                NUMERO.incrementAndGet(), "2")[0];
        assertViolacao("INSERT INTO itens_venda (empresa_id, venda_id, ordem, produto_id, produto_nome, unidade_sigla,"
                + " etiqueta, quantidade, quantidade_estoque, preco_unitario, origem_preco, valor_bruto,"
                + " desconto_item, desconto_rateado, valor_liquido) VALUES (" + empresaB + ", " + vendaB + ", 2, "
                + produtoA + ", 'Arroz', 'UN', false, 1, 1, 10, 'NORMAL', 10, 0, 0, 10)", "fk_item_venda_produto");
        long vendaA = inserirVenda(empresaA, sessaoA, usuarioA, "10.00");
        assertViolacao("INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, forma, valor,"
                + " usuario_id, venda_id, criado_em) VALUES (gen_random_uuid(), " + empresaB + ", " + sessaoB
                + ", 'RECEBIMENTO', 'PIX', 10.00, " + usuarioB + ", " + vendaA + ", now())",
                "fk_movimento_caixa_venda");
    }

    @Test
    void itemSemFkDeEmbalagem() {
        long embalagem = jdbc.queryForObject("INSERT INTO produto_embalagens (uuid, empresa_id, produto_id, unidade_id,"
                + " quantidade, ordem) VALUES (gen_random_uuid(), " + empresaA + ", " + produtoA + ", (SELECT id FROM"
                + " unidades_medida WHERE empresa_id = " + empresaA + " AND sigla = 'CX'), 3, 0) RETURNING id",
                Long.class);
        long item = jdbc.queryForObject("""
                WITH v AS (
                    INSERT INTO vendas (uuid, empresa_id, numero, sessao_caixa_id, usuario_id, status, subtotal,
                                        desconto_itens, desconto_total, total, troco, chave_idempotencia,
                                        concluida_em)
                    VALUES (gen_random_uuid(), ?, ?, ?, ?, 'CONCLUIDA', 30, 0, 0, 30, 0, gen_random_uuid(), now())
                    RETURNING id),
                i AS (
                    INSERT INTO itens_venda (empresa_id, venda_id, ordem, produto_id, produto_nome, unidade_sigla,
                                             embalagem_rotulo, embalagem_quantidade, etiqueta, quantidade,
                                             quantidade_estoque, preco_unitario, origem_preco, valor_bruto,
                                             desconto_item, desconto_rateado, valor_liquido)
                    SELECT ?, v.id, 1, ?, 'Arroz', 'CX', 'CX c/ 3 UN', 3, false, 1, 3, 30, 'EMBALAGEM', 30, 0, 0, 30
                      FROM v
                    RETURNING id),
                p AS (INSERT INTO pagamentos_venda (empresa_id, venda_id, forma, valor) SELECT ?, v.id, 'PIX', 30 FROM v)
                SELECT id FROM i
                """, Long.class, empresaA, NUMERO.incrementAndGet(), sessaoA, usuarioA, empresaA, produtoA, empresaA);

        jdbc.update("DELETE FROM produto_embalagens WHERE id = " + embalagem);

        assertThat(jdbc.queryForObject("SELECT embalagem_rotulo FROM itens_venda WHERE id = " + item, String.class))
                .isEqualTo("CX c/ 3 UN");
    }

    @Test
    void produtoVendidoNaoExcluido() {
        inserirVenda(empresaA, sessaoA, usuarioA, "10.00");
        jdbc.update("DELETE FROM movimentos_estoque WHERE produto_id = " + produtoA);
        jdbc.update("DELETE FROM estoque_saldos WHERE produto_id = " + produtoA);

        assertViolacao("DELETE FROM produtos WHERE id = " + produtoA, "fk_item_venda_produto");
    }

    // ---------- Configuracao do PDV ----------

    @Test
    void configuracaoPdvPadrao() {
        assertThat(contar("SELECT count(*) FROM configuracoes_pdv")).isZero();
        jdbc.update("INSERT INTO configuracoes_pdv (empresa_id, atualizado_por, atualizado_em) VALUES (" + empresaA
                + ", " + usuarioA + ", now())");

        assertThat(jdbc.queryForObject("SELECT vender_sem_estoque FROM configuracoes_pdv", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("SELECT desconto_maximo_operador FROM configuracoes_pdv", BigDecimal.class))
                .isEqualByComparingTo("10.00");
        assertViolacao("UPDATE configuracoes_pdv SET desconto_maximo_operador = 100.01", "ck_configuracao_pdv_desconto");
        assertViolacao("UPDATE configuracoes_pdv SET desconto_maximo_operador = -0.01",
                "ck_configuracao_pdv_desconto");
        jdbc.update("UPDATE configuracoes_pdv SET desconto_maximo_operador = 100");
        assertViolacao("INSERT INTO configuracoes_pdv (empresa_id, atualizado_por, atualizado_em) VALUES (" + empresaB
                + ", " + usuarioA + ", now())", "fk_configuracao_pdv_usuario");
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private long inserirSessaoAberta(long empresa, String ponto, long usuario) {
        Long pontoId = jdbc.query("SELECT id FROM pontos_caixa WHERE empresa_id = ? AND nome = ?",
                (linha, numero) -> linha.getLong(1), empresa, ponto).stream().findFirst().orElseGet(() ->
                        jdbc.queryForObject("INSERT INTO pontos_caixa (uuid, empresa_id, nome, criado_em) VALUES"
                                + " (gen_random_uuid(), ?, ?, now()) RETURNING id", Long.class, empresa, ponto));
        return jdbc.queryForObject("INSERT INTO sessoes_caixa (uuid, empresa_id, ponto_caixa_id, status, aberta_por,"
                + " aberta_em, fundo_troco) VALUES (gen_random_uuid(), ?, ?, 'ABERTA', ?, now(), 100.00) RETURNING id",
                Long.class, empresa, pontoId, usuario);
    }

    private void inserirMovimentoDeGaveta(long empresa, long sessao, long usuario, String tipo, String valor,
            String motivo) {
        jdbc.update("INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, valor, motivo, usuario_id,"
                + " chave_idempotencia, criado_em) VALUES (gen_random_uuid(), " + empresa + ", " + sessao + ", '"
                + tipo + "', " + valor + ", " + motivo + ", " + usuario + ", gen_random_uuid(), now())");
    }

    private void fecharSessaoSemDiferenca(long sessao) {
        jdbc.update(contarDinheiroSql(sessao, "FECHADA", true, "105.00"));
    }

    /** Contagem do dinheiro (esperado 105 = 100 + 10 - 5) com o contado informado. */
    private String contarDinheiroSql(long sessao, String status, boolean cego, String contado) {
        String fechamento = status.equals("FECHADA")
                ? ", fechada_por = " + usuarioA + ", fechada_em = now()"
                : "";
        return "UPDATE sessoes_caixa SET status = '" + status + "', fechamento_cego = " + cego
                + ", valor_esperado = 105.00, valor_contado = " + contado + ", diferenca = " + contado
                + " - 105.00, contada_por = " + usuarioA + ", contada_em = now(), justificativa = NULL" + fechamento
                + " WHERE id = " + sessao;
    }

    private String contagemSql(long sessao, String forma, String esperado, String contado) {
        return "INSERT INTO contagens_caixa (empresa_id, sessao_caixa_id, forma, valor_esperado, valor_contado,"
                + " diferenca) VALUES (" + empresaA + ", " + sessao + ", '" + forma + "', " + esperado + ", "
                + contado + ", " + contado + " - " + esperado + ")";
    }

    /** So a venda (sem itens nem pagamentos): serve para as recusas imediatas; sozinha, nao passa do commit. */
    private String vendaSql(long empresa, long sessao, long usuario, String total, String status, UUID chave,
            long numero) {
        return "INSERT INTO vendas (uuid, empresa_id, numero, sessao_caixa_id, usuario_id, status, subtotal,"
                + " desconto_itens, desconto_total, total, troco, chave_idempotencia, concluida_em) VALUES"
                + " (gen_random_uuid(), " + empresa + ", " + numero + ", " + sessao + ", " + usuario + ", " + status
                + ", " + total + ", 0, 0, " + total + ", 0, '" + chave + "', now())";
    }

    /**
     * Venda coerente num comando so: um item por quantidade (preco 5,00 e sem
     * desconto) e o pagamento em dinheiro do total; devolve os ids da venda e
     * dos itens, nessa ordem.
     */
    private String vendaCoerenteSql(long empresa, long sessao, long usuario, long produto, UUID chave, long numero,
            String... quantidades) {
        BigDecimal total = Arrays.stream(quantidades).map(BigDecimal::new).reduce(BigDecimal.ZERO, BigDecimal::add)
                .multiply(PRECO);
        String linhas = IntStream.range(0, quantidades.length)
                .mapToObj(indice -> "(" + (indice + 1) + ", " + quantidades[indice] + "::numeric)")
                .collect(Collectors.joining(", "));
        return """
                WITH l(ordem, q) AS (VALUES %s),
                v AS (
                    INSERT INTO vendas (uuid, empresa_id, numero, sessao_caixa_id, usuario_id, status, subtotal,
                                        desconto_itens, desconto_total, total, troco, chave_idempotencia,
                                        concluida_em)
                    VALUES (gen_random_uuid(), %d, %d, %d, %d, 'CONCLUIDA', %s, 0, 0, %s, 0, '%s', now())
                    RETURNING id),
                i AS (
                    INSERT INTO itens_venda (empresa_id, venda_id, ordem, produto_id, produto_nome, unidade_sigla,
                                             etiqueta, quantidade, quantidade_estoque, preco_unitario, origem_preco,
                                             valor_bruto, desconto_item, desconto_rateado, valor_liquido,
                                             custo_unitario)
                    SELECT %d, v.id, l.ordem, %d, 'Arroz', 'UN', false, l.q, l.q, 5.00, 'NORMAL', l.q * 5, 0, 0,
                           l.q * 5, 3.5
                      FROM v, l
                    RETURNING id, ordem),
                p AS (
                    INSERT INTO pagamentos_venda (empresa_id, venda_id, forma, valor)
                    SELECT %d, v.id, 'DINHEIRO', %s FROM v)
                SELECT v.id AS venda, i.id AS item FROM v, i ORDER BY i.ordem
                """.formatted(linhas, empresa, numero, sessao, usuario, total, total, chave, empresa, produto,
                empresa, total);
    }

    private long[] vendaCoerente(long empresa, long sessao, long usuario, long produto, UUID chave, long numero,
            String... quantidades) {
        List<long[]> linhas = jdbc.query(vendaCoerenteSql(empresa, sessao, usuario, produto, chave, numero,
                quantidades), (linha, indice) -> new long[] {linha.getLong("venda"), linha.getLong("item")});
        long[] ids = new long[linhas.size() + 1];
        ids[0] = linhas.get(0)[0];
        for (int indice = 0; indice < linhas.size(); indice++) {
            ids[indice + 1] = linhas.get(indice)[1];
        }
        return ids;
    }

    /** Venda coerente de um item do produto da empresa com o total informado (multiplo de 5,00). */
    private long inserirVenda(long empresa, long sessao, long usuario, String total) {
        String quantidade = new BigDecimal(total).divide(PRECO).toPlainString();
        long produto = empresa == empresaA ? produtoA : produtoB;
        return vendaCoerente(empresa, sessao, usuario, produto, UUID.randomUUID(), NUMERO.incrementAndGet(),
                quantidade)[0];
    }

    /** Venda de um item de R$ 10,00 com o liquido, o pagamento e o troco informados (para a conferencia no commit). */
    private String vendaComUmItemSql(BigDecimal bruto, BigDecimal liquido, String pagamento, String troco) {
        BigDecimal descontoItem = bruto.subtract(liquido);
        return """
                WITH v AS (
                    INSERT INTO vendas (uuid, empresa_id, numero, sessao_caixa_id, usuario_id, status, subtotal,
                                        desconto_itens, desconto_total, total, troco, chave_idempotencia,
                                        concluida_em)
                    VALUES (gen_random_uuid(), %d, %d, %d, %d, 'CONCLUIDA', 10.00, 0, 0, 10.00, %s, gen_random_uuid(),
                            now())
                    RETURNING id),
                i AS (
                    INSERT INTO itens_venda (empresa_id, venda_id, ordem, produto_id, produto_nome, unidade_sigla,
                                             etiqueta, quantidade, quantidade_estoque, preco_unitario, origem_preco,
                                             valor_bruto, desconto_item, desconto_rateado, valor_liquido)
                    SELECT %d, v.id, 1, %d, 'Arroz', 'UN', false, 2, 2, 5.00, 'NORMAL', %s, %s, 0, %s FROM v),
                p AS (INSERT INTO pagamentos_venda (empresa_id, venda_id, forma, valor) SELECT %d, v.id, %s FROM v)
                SELECT id FROM v
                """.formatted(empresaA, NUMERO.incrementAndGet(), sessaoA, usuarioA, troco, empresaA, produtoA, bruto,
                descontoItem, liquido, empresaA, pagamento);
    }

    private String cancelarSql(long venda, String motivo) {
        return "UPDATE vendas SET status = 'CANCELADA', cancelada_por = " + usuarioA + ", cancelada_em = now(),"
                + " motivo_cancelamento = '" + motivo + "' WHERE id = " + venda;
    }

    private String itemSql(long venda, int ordem, String quantidade, String quantidadeEstoque, String bruto,
            String descontoItem, String descontoRateado, String liquido, String rotulo, String quantidadeDaEmbalagem) {
        String origem = rotulo == null ? "'NORMAL'" : "'EMBALAGEM'";
        return "INSERT INTO itens_venda (empresa_id, venda_id, ordem, produto_id, produto_nome, unidade_sigla,"
                + " embalagem_rotulo, embalagem_quantidade, etiqueta, quantidade, quantidade_estoque, preco_unitario,"
                + " origem_preco, valor_bruto, desconto_item, desconto_rateado, valor_liquido, custo_unitario)"
                + " VALUES (" + empresaA + ", " + venda + ", " + ordem + ", " + produtoA + ", 'Arroz', 'UN', " + rotulo
                + ", " + quantidadeDaEmbalagem + ", false, " + quantidade + ", " + quantidadeEstoque + ", 5.00, "
                + origem + ", " + bruto + ", " + descontoItem + ", " + descontoRateado + ", " + liquido
                + ", 3.5000)";
    }

    private String movimentoDaVendaSql(long sessao, Long venda, String tipo, String forma, String valor) {
        return "INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, forma, valor, usuario_id,"
                + " venda_id, criado_em) VALUES (gen_random_uuid(), " + empresaA + ", " + sessao + ", '" + tipo
                + "', '" + forma + "', " + valor + ", " + usuarioA + ", " + venda + ", now())";
    }

    private String movimentoDeEstoqueSql(long produto, String tipo, String motivo, String origem, String quantidade,
            String anterior, Long itemVenda) {
        return "INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,"
                + " saldo_anterior, saldo_novo, usuario_id, item_venda_id) VALUES (" + empresaA + ", " + produto
                + ", '" + tipo + "', '" + motivo + "', '" + origem + "', " + quantidade + ", " + anterior + ", "
                + anterior + " + (" + quantidade + "), " + usuarioA + ", " + itemVenda + ")";
    }

    private void assertViolacao(String sql, String trechoDaMensagem) {
        assertThatThrownBy(() -> jdbc.execute(sql))
                .as("violacao (%s) em: %s", trechoDaMensagem, sql)
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

    /** Empresa FISICA com as colunas NOT NULL da V3, as unidades UN e CX e o "Caixa 1" da carga da V16. */
    private long inserirEmpresa(String nome) {
        String slug = nome.toLowerCase().replaceAll("[^a-z0-9]", "");
        long empresa = jdbc.queryForObject("""
                INSERT INTO empresa (nome, representante_nome, representante_cpf, representante_telefone,
                                     representante_email, telefone, email, tipo_pessoa, endereco_cep,
                                     endereco_logradouro, endereco_numero, endereco_bairro,
                                     endereco_municipio, endereco_uf)
                VALUES (?, ?, '11144477735', '11987654321', ?, '1133224455', ?, 'FISICA', '01001000',
                        'Praça da Sé', 'S/N', 'Sé', 'São Paulo', 'SP')
                RETURNING id
                """, Long.class, nome, "Representante " + nome, "rep@" + slug + ".test", "contato@" + slug + ".test");
        jdbc.update("INSERT INTO unidades_medida (empresa_id, sigla, descricao, fracionada) VALUES (?, 'UN', 'Unidade',"
                + " false), (?, 'CX', 'Caixa', false)", empresa, empresa);
        jdbc.update("INSERT INTO pontos_caixa (uuid, empresa_id, nome, criado_em) VALUES (gen_random_uuid(), ?,"
                + " 'Caixa 1', now())", empresa);
        return empresa;
    }

    private long inserirUsuario(long empresa, String apelido) {
        return jdbc.queryForObject("""
                INSERT INTO usuario (empresa_id, nome, email, senha_hash, perfil)
                VALUES (?, ?, ?, 'hash-irrelevante', 'OPERADOR')
                RETURNING id
                """, Long.class, empresa, "Usuario " + apelido, apelido + empresa + "@v17.test");
    }

    private long inserirProduto(long empresa, String nome) {
        long numero = contar("SELECT count(*) FROM produtos WHERE empresa_id = " + empresa) + 1;
        return jdbc.queryForObject("""
                INSERT INTO produtos (empresa_id, numero, nome, preco_venda, unidade_id, busca_normalizada,
                                      nome_normalizado)
                VALUES (?, ?, ?, 5.00, (SELECT id FROM unidades_medida WHERE empresa_id = ? AND sigla = 'UN'),
                        lower(?), lower(?))
                RETURNING id
                """, Long.class, empresa, numero, nome, empresa, nome, nome);
    }

    private void inserirEntradaDeEstoque(long empresa, long produto, long usuario, String quantidade) {
        jdbc.update("INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,"
                + " saldo_anterior, saldo_novo, usuario_id) VALUES (?, ?, 'ENTRADA', 'OUTRO', 'AJUSTE_MANUAL', ?::numeric,"
                + " 0, ?::numeric, ?)", empresa, produto, quantidade, quantidade, usuario);
        jdbc.update("INSERT INTO estoque_saldos (empresa_id, produto_id, saldo) VALUES (?, ?, ?::numeric)", empresa,
                produto, quantidade);
    }

    private long inserirCliente(long empresa, String nome) {
        return jdbc.queryForObject("INSERT INTO clientes (empresa_id, numero, nome) VALUES (?, 1, ?) RETURNING id",
                Long.class, empresa, nome);
    }
}
