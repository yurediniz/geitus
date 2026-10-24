package com.geitus.app.sales;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.UUID;

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
 * um usuario em cada, uma sessao aberta com abertura, suprimento e sangria e
 * um produto com saldo; aplica a V17 e confere a carga ({@code DINHEIRO} nos
 * movimentos atuais), os {@code CHECK}, as FKs compostas e os gatilhos de
 * vendas, itens, pagamentos, contagens por forma e da conferencia
 * (docs/modules/pdv.md, 4 e 8).
 *
 * <p>Constraints e gatilhos (SQLSTATE 23000) chegam como
 * {@link DataIntegrityViolationException}. Requer Docker.
 */
@Testcontainers
class MigracaoV17IT {

    private static final String VERSAO_ANTERIOR_A_V17 = "16";
    private static final String VERSAO_V17 = "17";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private SingleConnectionDataSource conexao;
    private JdbcTemplate jdbc;
    private long empresaA;
    private long empresaB;
    private long usuarioA;
    private long usuarioB;
    private long sessaoA;
    private long produtoA;

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
        sessaoA = inserirSessaoAberta(empresaA, usuarioA);
        inserirMovimentoDeGaveta(empresaA, sessaoA, usuarioA, "ABERTURA", "100.00", null);
        inserirMovimentoDeGaveta(empresaA, sessaoA, usuarioA, "SUPRIMENTO", "10.00", "'Troco'");
        inserirMovimentoDeGaveta(empresaA, sessaoA, usuarioA, "SANGRIA", "5.00", "'Cofre'");
        produtoA = inserirProduto(empresaA, "Arroz");
        inserirEntradaDeEstoque(empresaA, produtoA, usuarioA, "5");
        flyway(VERSAO_V17).migrate();
    }

    @AfterEach
    void fecharConexao() {
        conexao.destroy();
    }

    // ---------- Caixa: forma nos movimentos ----------

    @Test
    void movimentosAtuaisViramDinheiro() {
        assertThat(contar("SELECT count(*) FROM movimentos_caixa WHERE forma = 'DINHEIRO' AND venda_id IS NULL"))
                .isEqualTo(3);
        String padrao = jdbc.queryForObject("SELECT column_default FROM information_schema.columns"
                + " WHERE table_name = 'movimentos_caixa' AND column_name = 'forma'", String.class);
        assertThat(padrao).isNull();
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

    @Test
    void itemEPagamentoImutaveis() {
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "10.00");
        long item = inserirItem(venda, 1, "1.000", "1.000", null, null);
        jdbc.update("INSERT INTO pagamentos_venda (empresa_id, venda_id, forma, valor) VALUES (" + empresaA + ", "
                + venda + ", 'DINHEIRO', 10.00)");

        assertViolacao("UPDATE itens_venda SET produto_nome = 'Outro' WHERE id = " + item, "Item");
        assertViolacao("DELETE FROM itens_venda WHERE id = " + item, "Item");
        assertViolacao("UPDATE pagamentos_venda SET valor = 1 WHERE venda_id = " + venda, "Pagamento");
        assertViolacao("DELETE FROM pagamentos_venda WHERE venda_id = " + venda, "Pagamento");
        assertViolacao("INSERT INTO pagamentos_venda (empresa_id, venda_id, forma, valor) VALUES (" + empresaA + ", "
                + venda + ", 'DINHEIRO', 5.00)", "uq_pagamento_venda_forma");
        assertViolacao("INSERT INTO pagamentos_venda (empresa_id, venda_id, forma, valor) VALUES (" + empresaA + ", "
                + venda + ", 'PIX', 0)", "ck_pagamento_venda_valor");
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
        assertViolacao(itemSql(venda, 1, "2.000", "2.000", "10.00", "1.00", "0.00", "8.00", null, null),
                "ck_item_venda_liquido");
        assertViolacao(itemSql(venda, 1, "2.000", "3.000", "10.00", "0.00", "0.00", "10.00", null, null),
                "ck_item_venda_quantidade_estoque");
        assertViolacao(itemSql(venda, 1, "1.500", "4.500", "10.00", "0.00", "0.00", "10.00", "'CX c/ 3 UN'",
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
        jdbc.update(vendaSql(empresaA, sessaoA, usuarioA, "10.00", "'CONCLUIDA'", chave, 1));

        assertViolacao(vendaSql(empresaA, sessaoA, usuarioA, "10.00", "'CONCLUIDA'", chave, 2), "uq_venda_chave");
    }

    @Test
    void numeroRepetidoNaEmpresaRecusado() {
        jdbc.update(vendaSql(empresaA, sessaoA, usuarioA, "10.00", "'CONCLUIDA'", UUID.randomUUID(), 7));

        assertViolacao(vendaSql(empresaA, sessaoA, usuarioA, "10.00", "'CONCLUIDA'", UUID.randomUUID(), 7),
                "uq_venda_numero");
        jdbc.update("INSERT INTO numeracoes (empresa_id, tipo, ultimo_numero) VALUES (" + empresaA + ", 'VENDA', 7)");
    }

    // ---------- Estoque ----------

    @Test
    void saldoNegativoSoComMotivoVenda() {
        assertViolacao(movimentoDeEstoqueSql(produtoA, "AJUSTE", "CONTAGEM", "AJUSTE_MANUAL", "-6", "5", null),
                "ck_movimento_estoque_saldo_nao_negativo_fora_da_venda");
        assertViolacao(movimentoDeEstoqueSql(produtoA, "SAIDA", "PERDA_AVARIA", "AJUSTE_MANUAL", "-6", "5", null),
                "ck_movimento_estoque_saldo_nao_negativo_fora_da_venda");

        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "10.00");
        long item = inserirItem(venda, 1, "6.000", "6.000", null, null);
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
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "10.00");
        long item = inserirItem(venda, 1, "2.000", "2.000", null, null);
        jdbc.update(movimentoDeEstoqueSql(produtoA, "SAIDA", "VENDA", "VENDA", "-2", "5", item));
        jdbc.update(movimentoDeEstoqueSql(produtoA, "ENTRADA", "CANCELAMENTO_VENDA", "VENDA", "2", "3", item));

        assertViolacao(movimentoDeEstoqueSql(produtoA, "ENTRADA", "CANCELAMENTO_VENDA", "VENDA", "2", "5", item),
                "uq_movimento_estoque_item_venda");
        assertViolacao(movimentoDeEstoqueSql(produtoA, "SAIDA", "VENDA", "VENDA", "-2", "7", null),
                "ck_movimento_estoque_da_venda");
        assertViolacao(movimentoDeEstoqueSql(produtoA, "SAIDA", "CANCELAMENTO_VENDA", "VENDA", "-2", "7", item),
                "ck_movimento_estoque_motivo_do_tipo");
        long outroProduto = inserirProduto(empresaA, "Feijao");
        long itemDoArroz = inserirItem(venda, 2, "1.000", "1.000", null, null);
        assertViolacao(movimentoDeEstoqueSql(outroProduto, "SAIDA", "VENDA", "VENDA", "-1", "0", itemDoArroz),
                "fk_movimento_estoque_item_venda");
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

        assertThat(contar("SELECT count(*) FROM sessoes_caixa WHERE status = 'EM_CONFERENCIA'")).isEqualTo(1);
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
        assertViolacao(contarDinheiroSql(sessaoA, "FECHADA", true, "105.00") .replace("justificativa = NULL",
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

    // ---------- Integridade entre empresas ----------

    @Test
    void fksDeOutraEmpresaRecusadas() {
        long sessaoB = inserirSessaoAberta(empresaB, usuarioB);
        long clienteB = inserirCliente(empresaB, "Cliente B");

        assertViolacao(vendaSql(empresaB, sessaoA, usuarioB, "10.00", "'CONCLUIDA'", UUID.randomUUID(), 1),
                "fk_venda_sessao");
        assertViolacao("INSERT INTO vendas (uuid, empresa_id, numero, sessao_caixa_id, usuario_id, cliente_id,"
                + " cliente_nome, status, subtotal, desconto_itens, desconto_total, total, troco,"
                + " chave_idempotencia, concluida_em) VALUES (gen_random_uuid(), " + empresaA + ", 1, " + sessaoA
                + ", " + usuarioA + ", " + clienteB + ", 'Cliente B', 'CONCLUIDA', 10, 0, 0, 10, 0,"
                + " gen_random_uuid(), now())", "fk_venda_cliente");
        long vendaB = inserirVenda(empresaB, sessaoB, usuarioB, "10.00");
        assertViolacao("INSERT INTO itens_venda (empresa_id, venda_id, ordem, produto_id, produto_nome, unidade_sigla,"
                + " etiqueta, quantidade, quantidade_estoque, preco_unitario, origem_preco, valor_bruto,"
                + " desconto_item, desconto_rateado, valor_liquido) VALUES (" + empresaB + ", " + vendaB + ", 1, "
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
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "30.00");
        long item = inserirItem(venda, 1, "1.000", "3.000", "'CX c/ 3 UN'", "3.000");

        jdbc.update("DELETE FROM produto_embalagens WHERE id = " + embalagem);

        assertThat(jdbc.queryForObject("SELECT embalagem_rotulo FROM itens_venda WHERE id = " + item, String.class))
                .isEqualTo("CX c/ 3 UN");
    }

    @Test
    void produtoVendidoNaoExcluido() {
        long venda = inserirVenda(empresaA, sessaoA, usuarioA, "10.00");
        inserirItem(venda, 1, "1.000", "1.000", null, null);
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

    private long inserirSessaoAberta(long empresa, long usuario) {
        long ponto = jdbc.queryForObject("SELECT id FROM pontos_caixa WHERE empresa_id = ? AND nome = 'Caixa 1'",
                Long.class, empresa);
        return jdbc.queryForObject("INSERT INTO sessoes_caixa (uuid, empresa_id, ponto_caixa_id, status, aberta_por,"
                + " aberta_em, fundo_troco) VALUES (gen_random_uuid(), ?, ?, 'ABERTA', ?, now(), 100.00) RETURNING id",
                Long.class, empresa, ponto, usuario);
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

    private String vendaSql(long empresa, long sessao, long usuario, String total, String status, UUID chave,
            long numero) {
        return "INSERT INTO vendas (uuid, empresa_id, numero, sessao_caixa_id, usuario_id, status, subtotal,"
                + " desconto_itens, desconto_total, total, troco, chave_idempotencia, concluida_em) VALUES"
                + " (gen_random_uuid(), " + empresa + ", " + numero + ", " + sessao + ", " + usuario + ", " + status
                + ", " + total + ", 0, 0, " + total + ", 0, '" + chave + "', now())";
    }

    private long inserirVenda(long empresa, long sessao, long usuario, String total) {
        long numero = contar("SELECT count(*) FROM vendas WHERE empresa_id = " + empresa) + 100;
        return jdbc.queryForObject(vendaSql(empresa, sessao, usuario, total, "'CONCLUIDA'", UUID.randomUUID(), numero)
                + " RETURNING id", Long.class);
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

    private long inserirItem(long venda, int ordem, String quantidade, String quantidadeEstoque, String rotulo,
            String quantidadeDaEmbalagem) {
        return jdbc.queryForObject(itemSql(venda, ordem, quantidade, quantidadeEstoque, "10.00", "0.00", "0.00",
                "10.00", rotulo, quantidadeDaEmbalagem) + " RETURNING id", Long.class);
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
        assertThatThrownBy(() -> jdbc.update(sql))
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
