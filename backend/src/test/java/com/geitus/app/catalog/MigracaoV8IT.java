package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Teste de migracao da V8 (precos do produto, Fase C) contra um PostgreSQL
 * real (Testcontainers), <b>sem Spring</b>.
 *
 * <p>Cada teste parte de um banco limpo no schema da V7, insere empresas,
 * usuarios e produtos como existem hoje, aplica a V8 e confere via JDBC: os
 * produtos sao preservados com as colunas novas nulas, o historico comeca
 * vazio e as constraints novas (tudo-ou-nada da promocao e do atacado,
 * periodo, quantidade minima, FKs compostas por empresa — DEC-016 — e as
 * regras da linha de historico) rejeitam dado invalido.
 *
 * <p>Requer Docker disponivel no ambiente.
 */
@Testcontainers
class MigracaoV8IT {

    private static final String VERSAO_ANTERIOR_A_V8 = "7";
    private static final String VERSAO_V8 = "8";
    private static final String VIOLACAO_DE_CHECK = "23514";
    private static final String VIOLACAO_DE_FK = "23503";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @BeforeEach
    void prepararBancoNoSchemaDaV7() {
        Flyway flywayAteV7 = flyway(VERSAO_ANTERIOR_A_V8);
        flywayAteV7.clean();
        flywayAteV7.migrate();
    }

    @Test
    void produtosExistentesMantidosComColunasNovasNulas() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long arroz = inserirProduto(empresa, "Arroz");
        long feijao = inserirProduto(empresa, "Feijao");

        aplicarV8();

        assertThat(contar("SELECT count(*) FROM produtos WHERE id IN (" + arroz + ", " + feijao + ")"))
                .isEqualTo(2);
        assertThat(contar("SELECT count(*) FROM produtos WHERE nome = 'Arroz' AND preco_venda = 10.00"))
                .as("dados existentes intactos").isEqualTo(1);
        assertThat(contar("""
                SELECT count(*) FROM produtos
                 WHERE preco_promocional IS NULL AND promocao_inicio IS NULL AND promocao_fim IS NULL
                   AND preco_atacado IS NULL AND quantidade_minima_atacado IS NULL
                """)).isEqualTo(2);
    }

    @Test
    void historicoComecaVazio() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        inserirProduto(empresa, "Arroz");

        aplicarV8();

        assertThat(contar("SELECT count(*) FROM produto_historico_precos")).isZero();
    }

    @Test
    void rejeitaPromocaoIncompleta() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        aplicarV8();

        assertViolacao("UPDATE produtos SET preco_promocional = 8.90 WHERE id = " + produto,
                "ck_produto_promocao_completa", VIOLACAO_DE_CHECK);
        assertViolacao("UPDATE produtos SET promocao_inicio = DATE '2026-11-01', promocao_fim = DATE '2026-11-15'"
                + " WHERE id = " + produto, "ck_produto_promocao_completa", VIOLACAO_DE_CHECK);

        executar("UPDATE produtos SET preco_promocional = 8.90, promocao_inicio = DATE '2026-11-01',"
                + " promocao_fim = DATE '2026-11-15' WHERE id = " + produto);
        assertThat(contar("SELECT count(*) FROM produtos WHERE preco_promocional = 8.90")).isEqualTo(1);
    }

    @Test
    void rejeitaFimAntesDoInicio() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        aplicarV8();

        assertViolacao("UPDATE produtos SET preco_promocional = 8.90, promocao_inicio = DATE '2026-11-15',"
                + " promocao_fim = DATE '2026-11-14' WHERE id = " + produto,
                "ck_produto_promocao_periodo", VIOLACAO_DE_CHECK);

        executar("UPDATE produtos SET preco_promocional = 8.90, promocao_inicio = DATE '2026-11-15',"
                + " promocao_fim = DATE '2026-11-15' WHERE id = " + produto);
    }

    @Test
    void rejeitaPrecoPromocionalNaoPositivo() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        aplicarV8();

        for (String preco : new String[] {"0", "-1"}) {
            assertViolacao("UPDATE produtos SET preco_promocional = " + preco + ", promocao_inicio = DATE '2026-11-01',"
                    + " promocao_fim = DATE '2026-11-15' WHERE id = " + produto,
                    "ck_produto_preco_promocional_positivo", VIOLACAO_DE_CHECK);
        }
    }

    @Test
    void rejeitaAtacadoIncompleto() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        aplicarV8();

        assertViolacao("UPDATE produtos SET preco_atacado = 8.50 WHERE id = " + produto,
                "ck_produto_atacado_completo", VIOLACAO_DE_CHECK);
        assertViolacao("UPDATE produtos SET quantidade_minima_atacado = 12 WHERE id = " + produto,
                "ck_produto_atacado_completo", VIOLACAO_DE_CHECK);

        executar("UPDATE produtos SET preco_atacado = 8.50, quantidade_minima_atacado = 12 WHERE id = " + produto);
    }

    @Test
    void rejeitaPrecoAtacadoNaoPositivo() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        aplicarV8();

        for (String preco : new String[] {"0", "-1"}) {
            assertViolacao("UPDATE produtos SET preco_atacado = " + preco + ", quantidade_minima_atacado = 12"
                    + " WHERE id = " + produto, "ck_produto_preco_atacado_positivo", VIOLACAO_DE_CHECK);
        }
    }

    @Test
    void rejeitaQuantidadeMinimaAteUm() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        aplicarV8();

        assertViolacao("UPDATE produtos SET preco_atacado = 8.50, quantidade_minima_atacado = 1.000 WHERE id = "
                + produto, "ck_produto_quantidade_minima_atacado", VIOLACAO_DE_CHECK);

        executar("UPDATE produtos SET preco_atacado = 8.50, quantidade_minima_atacado = 1.001 WHERE id = " + produto);
    }

    @Test
    void rejeitaHistoricoComUsuarioDeOutraEmpresa() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long produtoA = inserirProduto(empresaA, "Arroz");
        long usuarioA = inserirUsuario(empresaA, "a");
        long usuarioB = inserirUsuario(empresaB, "b");
        aplicarV8();

        assertViolacao(inserirHistoricoSql(empresaA, produtoA, "PRECO_VENDA", null, "10.00", usuarioB),
                "fk_historico_preco_usuario", VIOLACAO_DE_FK);
        assertViolacao(inserirHistoricoSql(empresaB, produtoA, "PRECO_VENDA", null, "10.00", usuarioB),
                "fk_historico_preco_produto", VIOLACAO_DE_FK);

        executar(inserirHistoricoSql(empresaA, produtoA, "PRECO_VENDA", null, "10.00", usuarioA));
        assertThat(contar("SELECT count(*) FROM produto_historico_precos WHERE alterado_em IS NOT NULL"))
                .as("alterado_em preenchido pelo DEFAULT").isEqualTo(1);
    }

    @Test
    void rejeitaHistoricoSemMudanca() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        long usuario = inserirUsuario(empresa, "a");
        aplicarV8();

        assertViolacao(inserirHistoricoSql(empresa, produto, "CUSTO", "5.00", "5.00", usuario),
                "ck_historico_preco_mudanca", VIOLACAO_DE_CHECK);
        assertViolacao(inserirHistoricoSql(empresa, produto, "CUSTO", null, null, usuario),
                "ck_historico_preco_mudanca", VIOLACAO_DE_CHECK);
        assertViolacao(inserirHistoricoSql(empresa, produto, "MARGEM", null, "5.00", usuario),
                "ck_historico_preco_campo", VIOLACAO_DE_CHECK);

        executar(inserirHistoricoSql(empresa, produto, "CUSTO", "5.00", null, usuario));
    }

    @Test
    void rejeitaPrecoVendaNovoNulo() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        long usuario = inserirUsuario(empresa, "a");
        aplicarV8();

        assertViolacao(inserirHistoricoSql(empresa, produto, "PRECO_VENDA", "10.00", null, usuario),
                "ck_historico_preco_venda_nao_nulo", VIOLACAO_DE_CHECK);
    }

    /** Usuario com historico nao pode ser excluido fisicamente: FK RESTRICT (spec 3.2). */
    @Test
    void rejeitaExcluirUsuarioComHistorico() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        long comHistorico = inserirUsuario(empresa, "a");
        long semHistorico = inserirUsuario(empresa, "b");
        aplicarV8();
        executar(inserirHistoricoSql(empresa, produto, "PRECO_VENDA", null, "10.00", comHistorico));

        assertViolacao("DELETE FROM usuario WHERE id = " + comHistorico, "fk_historico_preco_usuario",
                VIOLACAO_DE_FK);

        executar("DELETE FROM usuario WHERE id = " + semHistorico);
        assertThat(contar("SELECT count(*) FROM produto_historico_precos")).isEqualTo(1);
    }

    @Test
    void excluirProdutoApagaHistoricoEmCascata() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz");
        long outroProduto = inserirProduto(empresa, "Feijao");
        long usuario = inserirUsuario(empresa, "a");
        aplicarV8();
        executar(inserirHistoricoSql(empresa, produto, "PRECO_VENDA", null, "10.00", usuario));
        executar(inserirHistoricoSql(empresa, produto, "CUSTO", null, "7.00", usuario));
        executar(inserirHistoricoSql(empresa, outroProduto, "PRECO_VENDA", null, "10.00", usuario));

        executar("DELETE FROM produtos WHERE id = " + produto);

        assertThat(contar("SELECT count(*) FROM produto_historico_precos WHERE produto_id = " + produto)).isZero();
        assertThat(contar("SELECT count(*) FROM produto_historico_precos WHERE produto_id = " + outroProduto))
                .isEqualTo(1);
    }

    private static String inserirHistoricoSql(long empresaId, long produtoId, String campo, String anterior,
            String novo, long usuarioId) {
        return "INSERT INTO produto_historico_precos (empresa_id, produto_id, campo, valor_anterior, valor_novo,"
                + " usuario_id) VALUES (" + empresaId + ", " + produtoId + ", '" + campo + "', " + anterior + ", "
                + novo + ", " + usuarioId + ")";
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

    /** Aplica exatamente ate a V8 (migrations futuras nao interferem no teste). */
    private static void aplicarV8() {
        flyway(VERSAO_V8).migrate();
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

    /** Produto no schema da V7 (uuid pelo DEFAULT do banco). */
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
            comando.setString(3, apelido + empresaId + "@v8.test");
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
