package com.geitus.app.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Teste de migracao da V9 (estoque basico, Fase D) contra um PostgreSQL real
 * (Testcontainers), <b>sem Spring</b>.
 *
 * <p>Cada teste parte de um banco limpo no schema da V8, insere empresas,
 * usuarios e produtos como existem hoje, aplica a V9 e confere via JDBC: os
 * produtos existentes passam a controlar estoque, as tabelas novas comecam
 * vazias e as constraints (saldo nao negativo, coerencia do movimento, motivos,
 * FKs RESTRICT para o produto, FK composta do usuario — DEC-016 — e
 * unicidades) rejeitam dado invalido (docs/modules/estoque.md).
 *
 * <p>Requer Docker disponivel no ambiente.
 */
@Testcontainers
class MigracaoV9IT {

    private static final String VERSAO_ANTERIOR_A_V9 = "8";
    private static final String VERSAO_V9 = "9";
    private static final String VIOLACAO_DE_CHECK = "23514";
    private static final String VIOLACAO_DE_FK = "23503";
    private static final String VIOLACAO_DE_UNICIDADE = "23505";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @BeforeEach
    void prepararBancoNoSchemaDaV8() {
        Flyway flywayAteV8 = flyway(VERSAO_ANTERIOR_A_V9);
        flywayAteV8.clean();
        flywayAteV8.migrate();
    }

    @Test
    void produtosExistentesPassamAControlarEstoque() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        inserirProduto(empresa, "Arroz");
        inserirProduto(empresa, "Feijao");

        aplicarV9();

        assertThat(contar("SELECT count(*) FROM produtos WHERE controla_estoque = true")).isEqualTo(2);
        assertThat(contar("SELECT count(*) FROM produtos WHERE nome = 'Arroz' AND preco_venda = 10.00"))
                .as("dados existentes intactos").isEqualTo(1);
    }

    @Test
    void tabelasComecamVazias() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        inserirProduto(empresa, "Arroz");

        aplicarV9();

        assertThat(contar("SELECT count(*) FROM estoque_saldos")).isZero();
        assertThat(contar("SELECT count(*) FROM movimentos_estoque")).isZero();
    }

    @Test
    void rejeitaSaldoNegativo() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        aplicarV9();

        assertViolacao(inserirSaldoSql(empresa, produto, "-0.001"), "ck_estoque_saldo_nao_negativo",
                VIOLACAO_DE_CHECK);

        executar(inserirSaldoSql(empresa, produto, "0"));
        assertThat(contar("SELECT count(*) FROM estoque_saldos WHERE atualizado_em IS NOT NULL")).isEqualTo(1);
    }

    @Test
    void rejeitaSaldoNovoIncoerente() throws SQLException {
        Cenario cenario = cenarioComUmProduto();

        assertViolacao(cenario.movimento("ENTRADA", "COMPRA", "AJUSTE_MANUAL", "5", "0", "6"),
                "ck_movimento_estoque_coerencia", VIOLACAO_DE_CHECK);
        assertViolacao(cenario.movimento("SAIDA", "PERDA_AVARIA", "AJUSTE_MANUAL", "-5", "3", "-2"),
                "ck_movimento_estoque_saldos", VIOLACAO_DE_CHECK);

        executar(cenario.movimento("ENTRADA", "COMPRA", "AJUSTE_MANUAL", "5", "0", "5"));
        executar(cenario.movimento("AJUSTE", "CONTAGEM", "AJUSTE_MANUAL", "-2.5", "5", "2.5"));
        assertThat(contar("SELECT count(*) FROM movimentos_estoque WHERE uuid IS NOT NULL AND criado_em IS NOT NULL"))
                .as("uuid e criado_em preenchidos pelo DEFAULT").isEqualTo(2);
    }

    @Test
    void rejeitaEntradaComQuantidadeNegativa() throws SQLException {
        Cenario cenario = cenarioComUmProduto();

        assertViolacao(cenario.movimento("ENTRADA", "COMPRA", "AJUSTE_MANUAL", "-1", "5", "4"),
                "ck_movimento_estoque_sinal", VIOLACAO_DE_CHECK);
    }

    @Test
    void rejeitaSaidaComQuantidadePositiva() throws SQLException {
        Cenario cenario = cenarioComUmProduto();

        assertViolacao(cenario.movimento("SAIDA", "PERDA_AVARIA", "AJUSTE_MANUAL", "1", "5", "6"),
                "ck_movimento_estoque_sinal", VIOLACAO_DE_CHECK);
    }

    @Test
    void rejeitaQuantidadeZero() throws SQLException {
        Cenario cenario = cenarioComUmProduto();

        assertViolacao(cenario.movimento("AJUSTE", "CONTAGEM", "AJUSTE_MANUAL", "0", "5", "5"),
                "ck_movimento_estoque_quantidade", VIOLACAO_DE_CHECK);
    }

    @Test
    void rejeitaCadastroComMotivoDiferenteDeEstoqueInicial() throws SQLException {
        Cenario cenario = cenarioComUmProduto();

        assertViolacao(cenario.movimento("ENTRADA", "COMPRA", "CADASTRO", "5", "0", "5"),
                "ck_movimento_estoque_cadastro", VIOLACAO_DE_CHECK);
        assertViolacao(cenario.movimento("AJUSTE", "ESTOQUE_INICIAL", "CADASTRO", "5", "0", "5"),
                "ck_movimento_estoque_cadastro", VIOLACAO_DE_CHECK);

        executar(cenario.movimento("ENTRADA", "ESTOQUE_INICIAL", "CADASTRO", "5", "0", "5"));
    }

    @Test
    void rejeitaMotivoForaDaLista() throws SQLException {
        Cenario cenario = cenarioComUmProduto();

        assertViolacao(cenario.movimento("ENTRADA", "PRESENTE", "AJUSTE_MANUAL", "5", "0", "5"),
                "ck_movimento_estoque_motivo", VIOLACAO_DE_CHECK);
        assertViolacao(cenario.movimento("TROCA", "COMPRA", "AJUSTE_MANUAL", "5", "0", "5"),
                "ck_movimento_estoque_tipo", VIOLACAO_DE_CHECK);
        assertViolacao(cenario.movimento("ENTRADA", "COMPRA", "IMPORTACAO", "5", "0", "5"),
                "ck_movimento_estoque_origem", VIOLACAO_DE_CHECK);
    }

    /** FK RESTRICT (DT-028): o banco barra excluir produto que movimentou. */
    @Test
    void rejeitaExcluirProdutoComMovimento() throws SQLException {
        Cenario cenario = cenarioComUmProduto();
        executar(cenario.movimento("ENTRADA", "COMPRA", "AJUSTE_MANUAL", "5", "0", "5"));

        assertViolacao("DELETE FROM produtos WHERE id = " + cenario.produto(), "fk_movimento_estoque_produto",
                VIOLACAO_DE_FK);
    }

    @Test
    void rejeitaExcluirProdutoComSaldo() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        long semEstoque = inserirProduto(empresa, "Feijao");
        aplicarV9();
        executar(inserirSaldoSql(empresa, produto, "0"));

        assertViolacao("DELETE FROM produtos WHERE id = " + produto, "fk_estoque_saldo_produto", VIOLACAO_DE_FK);

        executar("DELETE FROM produtos WHERE id = " + semEstoque);
    }

    @Test
    void rejeitaMovimentoComUsuarioDeOutraEmpresa() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long produtoA = inserirProduto(empresaA, "Arroz");
        inserirUsuario(empresaA, "a");
        long usuarioB = inserirUsuario(empresaB, "b");
        aplicarV9();
        Cenario daA = new Cenario(empresaA, produtoA, usuarioB);
        Cenario produtoDaAComEmpresaB = new Cenario(empresaB, produtoA, usuarioB);

        assertViolacao(daA.movimento("ENTRADA", "COMPRA", "AJUSTE_MANUAL", "5", "0", "5"),
                "fk_movimento_estoque_usuario", VIOLACAO_DE_FK);
        assertViolacao(produtoDaAComEmpresaB.movimento("ENTRADA", "COMPRA", "AJUSTE_MANUAL", "5", "0", "5"),
                "fk_movimento_estoque_produto", VIOLACAO_DE_FK);
        assertViolacao(inserirSaldoSql(empresaB, produtoA, "0"), "fk_estoque_saldo_produto", VIOLACAO_DE_FK);
    }

    @Test
    void chaveDeIdempotenciaUnicaPorEmpresa() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        Cenario daA = new Cenario(empresaA, inserirProduto(empresaA, "Arroz"), inserirUsuario(empresaA, "a"));
        Cenario daB = new Cenario(empresaB, inserirProduto(empresaB, "Arroz"), inserirUsuario(empresaB, "b"));
        aplicarV9();
        UUID chave = UUID.randomUUID();

        executar(daA.movimentoComChave(chave, "5", "0", "5"));
        executar(daB.movimentoComChave(chave, "5", "0", "5"));
        assertViolacao(daA.movimentoComChave(chave, "1", "5", "6"), "uq_movimento_estoque_chave",
                VIOLACAO_DE_UNICIDADE);

        // Sem chave (estoque inicial do cadastro): varios movimentos sem conflito.
        executar(daA.movimento("ENTRADA", "COMPRA", "AJUSTE_MANUAL", "1", "5", "6"));
        executar(daA.movimento("ENTRADA", "COMPRA", "AJUSTE_MANUAL", "1", "6", "7"));
        assertThat(contar("SELECT count(*) FROM movimentos_estoque WHERE chave_idempotencia IS NULL"))
                .isEqualTo(2);
    }

    /** O estoque inicial so nasce no cadastro. */
    @Test
    void rejeitaEstoqueInicialForaDoCadastro() throws SQLException {
        Cenario cenario = cenarioComUmProduto();

        assertViolacao(cenario.movimento("ENTRADA", "ESTOQUE_INICIAL", "AJUSTE_MANUAL", "5", "0", "5"),
                "ck_movimento_estoque_inicial", VIOLACAO_DE_CHECK);
    }

    /** O cadastro e sempre o primeiro movimento: parte do saldo zero. */
    @Test
    void rejeitaCadastroQueNaoParteDoZero() throws SQLException {
        Cenario cenario = cenarioComUmProduto();

        assertViolacao(cenario.movimento("ENTRADA", "ESTOQUE_INICIAL", "CADASTRO", "5", "3", "8"),
                "ck_movimento_estoque_cadastro_do_zero", VIOLACAO_DE_CHECK);
    }

    @Test
    void umEstoqueInicialPorProduto() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long usuario = inserirUsuario(empresa, "a");
        Cenario arroz = new Cenario(empresa, inserirProduto(empresa, "Arroz"), usuario);
        Cenario feijao = new Cenario(empresa, inserirProduto(empresa, "Feijao"), usuario);
        aplicarV9();
        executar(arroz.movimento("ENTRADA", "ESTOQUE_INICIAL", "CADASTRO", "5", "0", "5"));

        assertViolacao(arroz.movimento("ENTRADA", "ESTOQUE_INICIAL", "CADASTRO", "5", "0", "5"),
                "uq_movimento_estoque_inicial", VIOLACAO_DE_UNICIDADE);

        executar(feijao.movimento("ENTRADA", "ESTOQUE_INICIAL", "CADASTRO", "5", "0", "5"));
        executar(arroz.movimento("ENTRADA", "COMPRA", "AJUSTE_MANUAL", "1", "5", "6"));
    }

    /** Matriz tipo x motivo da spec de Estoque, tambem no banco. */
    @Test
    void rejeitaMotivoDeOutroTipo() throws SQLException {
        Cenario cenario = cenarioComUmProduto();
        String violacao = "ck_movimento_estoque_motivo_do_tipo";

        assertViolacao(cenario.movimento("ENTRADA", "PERDA_AVARIA", "AJUSTE_MANUAL", "5", "0", "5"), violacao,
                VIOLACAO_DE_CHECK);
        assertViolacao(cenario.movimento("ENTRADA", "VENDA", "AJUSTE_MANUAL", "5", "0", "5"), violacao,
                VIOLACAO_DE_CHECK);
        assertViolacao(cenario.movimento("SAIDA", "COMPRA", "AJUSTE_MANUAL", "-1", "5", "4"), violacao,
                VIOLACAO_DE_CHECK);
        assertViolacao(cenario.movimento("SAIDA", "CONTAGEM", "AJUSTE_MANUAL", "-1", "5", "4"), violacao,
                VIOLACAO_DE_CHECK);
        assertViolacao(cenario.movimento("AJUSTE", "COMPRA", "AJUSTE_MANUAL", "1", "5", "6"), violacao,
                VIOLACAO_DE_CHECK);
        assertViolacao(cenario.movimento("AJUSTE", "VENDA", "AJUSTE_MANUAL", "-1", "5", "4"), violacao,
                VIOLACAO_DE_CHECK);

        executar(cenario.movimento("ENTRADA", "DEVOLUCAO_CLIENTE", "AJUSTE_MANUAL", "5", "0", "5"));
        executar(cenario.movimento("ENTRADA", "OUTRO", "AJUSTE_MANUAL", "1", "5", "6"));
        executar(cenario.movimento("SAIDA", "VENDA", "VENDA", "-1", "6", "5"));
        executar(cenario.movimento("SAIDA", "DEVOLUCAO_FORNECEDOR", "AJUSTE_MANUAL", "-1", "5", "4"));
        executar(cenario.movimento("SAIDA", "OUTRO", "AJUSTE_MANUAL", "-1", "4", "3"));
        executar(cenario.movimento("AJUSTE", "CONTAGEM", "AJUSTE_MANUAL", "2", "3", "5"));
        executar(cenario.movimento("AJUSTE", "OUTRO", "AJUSTE_MANUAL", "-1", "5", "4"));
    }

    @Test
    void umSaldoPorProduto() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        aplicarV9();
        executar(inserirSaldoSql(empresa, produto, "3"));

        assertViolacao(inserirSaldoSql(empresa, produto, "0"), "uq_estoque_saldo_produto", VIOLACAO_DE_UNICIDADE);

        // O INSERT ... ON CONFLICT DO NOTHING do servico nao altera a linha existente.
        executar("INSERT INTO estoque_saldos (empresa_id, produto_id) VALUES (" + empresa + ", " + produto
                + ") ON CONFLICT (empresa_id, produto_id) DO NOTHING");
        assertThat(contar("SELECT count(*) FROM estoque_saldos WHERE saldo = 3")).isEqualTo(1);
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    /** Empresa, produto e usuario ja inseridos, com a V9 aplicada. */
    private static Cenario cenarioComUmProduto() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        long usuario = inserirUsuario(empresa, "a");
        aplicarV9();
        return new Cenario(empresa, produto, usuario);
    }

    private record Cenario(long empresa, long produto, long usuario) {

        String movimento(String tipo, String motivo, String origem, String quantidade, String saldoAnterior,
                String saldoNovo) {
            return "INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,"
                    + " saldo_anterior, saldo_novo, usuario_id) VALUES (" + empresa + ", " + produto + ", '" + tipo
                    + "', '" + motivo + "', '" + origem + "', " + quantidade + ", " + saldoAnterior + ", "
                    + saldoNovo + ", " + usuario + ")";
        }

        String movimentoComChave(UUID chave, String quantidade, String saldoAnterior, String saldoNovo) {
            return "INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,"
                    + " saldo_anterior, saldo_novo, usuario_id, chave_idempotencia) VALUES (" + empresa + ", "
                    + produto + ", 'ENTRADA', 'COMPRA', 'AJUSTE_MANUAL', " + quantidade + ", " + saldoAnterior + ", "
                    + saldoNovo + ", " + usuario + ", '" + chave + "')";
        }
    }

    private static String inserirSaldoSql(long empresaId, long produtoId, String saldo) {
        return "INSERT INTO estoque_saldos (empresa_id, produto_id, saldo) VALUES (" + empresaId + ", " + produtoId
                + ", " + saldo + ")";
    }

    private static void assertViolacao(String sql, String constraint, String sqlState) {
        assertThatThrownBy(() -> executar(sql))
                .as("violacao de %s em: %s", constraint, sql)
                .isInstanceOf(SQLException.class)
                .hasMessageContaining(constraint)
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(sqlState);
    }

    // ------------------------------------------------------------------
    // Infra: Flyway programatico e JDBC puro (sem Spring).
    // ------------------------------------------------------------------

    private static Flyway flyway(String versaoAlvo) {
        return Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .cleanDisabled(false)
                .target(versaoAlvo)
                .load();
    }

    /** Aplica exatamente ate a V9 (migrations futuras nao interferem no teste). */
    private static void aplicarV9() {
        flyway(VERSAO_V9).migrate();
    }

    private static Connection conectar() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    private static void executar(String sql) throws SQLException {
        try (Connection conexao = conectar(); Statement comando = conexao.createStatement()) {
            comando.executeUpdate(sql);
        }
    }

    private static long contar(String sql) throws SQLException {
        try (Connection conexao = conectar();
                Statement comando = conexao.createStatement();
                ResultSet resultado = comando.executeQuery(sql)) {
            resultado.next();
            return resultado.getLong(1);
        }
    }

    /** Empresa FISICA com as colunas NOT NULL da V3 e a unidade UN. */
    private static long inserirEmpresa(String nome) throws SQLException {
        String slug = nome.toLowerCase().replaceAll("[^a-z0-9]", "");
        String sql = """
                INSERT INTO empresa (nome, representante_nome, representante_cpf, representante_telefone,
                                     representante_email, telefone, email, tipo_pessoa, endereco_cep,
                                     endereco_logradouro, endereco_numero, endereco_bairro,
                                     endereco_municipio, endereco_uf)
                VALUES (?, ?, '11144477735', '11987654321', ?, '1133224455', ?, 'FISICA', '01001000',
                        'Praça da Sé', 'S/N', 'Sé', 'São Paulo', 'SP')
                RETURNING id
                """;
        long empresaId;
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setString(1, nome);
            comando.setString(2, "Representante " + nome);
            comando.setString(3, "rep@" + slug + ".test");
            comando.setString(4, "contato@" + slug + ".test");
            empresaId = idRetornado(comando);
        }
        executar("INSERT INTO unidades_medida (empresa_id, sigla, descricao) VALUES (" + empresaId
                + ", 'UN', 'Unidade')");
        return empresaId;
    }

    /** Produto no schema da V8 (uuid pelo DEFAULT do banco). */
    private static long inserirProduto(long empresaId, String nome) throws SQLException {
        String sql = """
                INSERT INTO produtos (empresa_id, nome, preco_venda, unidade_id)
                VALUES (?, ?, 10.00, (SELECT id FROM unidades_medida WHERE empresa_id = ? AND sigla = 'UN'))
                RETURNING id
                """;
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setLong(1, empresaId);
            comando.setString(2, nome);
            comando.setLong(3, empresaId);
            return idRetornado(comando);
        }
    }

    private static long inserirUsuario(long empresaId, String apelido) throws SQLException {
        String sql = """
                INSERT INTO usuario (empresa_id, nome, email, senha_hash, perfil)
                VALUES (?, ?, ?, 'hash-irrelevante', 'ADMIN')
                RETURNING id
                """;
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setLong(1, empresaId);
            comando.setString(2, "Usuario " + apelido);
            comando.setString(3, apelido + empresaId + "@v9.test");
            return idRetornado(comando);
        }
    }

    private static long idRetornado(PreparedStatement comando) throws SQLException {
        try (ResultSet resultado = comando.executeQuery()) {
            resultado.next();
            return resultado.getLong(1);
        }
    }
}
