package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Teste de migracao de dados da V7 (identificacao do produto) contra um
 * PostgreSQL real (Testcontainers), <b>sem Spring</b>.
 *
 * <p>Cada teste parte de um banco limpo no schema da V6, insere empresas e
 * produtos com {@code codigo_barras} em coluna unica (como existem hoje), aplica
 * a V7 e confere via JDBC: codigos copiados para {@code produto_codigos_barras}
 * com formato calculado (digito GS1 invalido vira {@code OUTRO}, sem perder
 * dado), uuid preenchido, colunas antigas removidas, isolamento por empresa
 * (DEC-016) e as constraints novas.
 *
 * <p>Requer Docker disponivel no ambiente.
 */
@Testcontainers
class MigracaoV7IT {

    private static final String VERSAO_ANTERIOR_A_V7 = "6";
    private static final String VERSAO_V7 = "7";
    private static final String VIOLACAO_DE_UNICIDADE = "23505";
    private static final String VIOLACAO_DE_CHECK = "23514";
    private static final String VIOLACAO_DE_FK = "23503";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @BeforeEach
    void prepararBancoNoSchemaDaV6() {
        Flyway flywayAteV6 = flyway(VERSAO_ANTERIOR_A_V7);
        flywayAteV6.clean();
        flywayAteV6.migrate();
    }

    @Test
    void codigoAntigoViraCodigoNaTabelaComFormato() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long ean13 = inserirProduto(empresa, "Arroz", "7891000315507");
        long ean8 = inserirProduto(empresa, "Bala", "96385074");
        long upca = inserirProduto(empresa, "Refrigerante importado", "036000291452");
        long digitoErrado = inserirProduto(empresa, "Feijao", "7891000315508");
        long alfanumerico = inserirProduto(empresa, "Racao", "ABC-123");

        aplicarV7();

        assertThat(codigosDoProduto(ean13)).containsExactly(new CodigoMigrado("7891000315507", "EAN13", 0));
        assertThat(codigosDoProduto(ean8)).containsExactly(new CodigoMigrado("96385074", "EAN8", 0));
        assertThat(codigosDoProduto(upca)).containsExactly(new CodigoMigrado("036000291452", "UPCA", 0));
        assertThat(codigosDoProduto(digitoErrado))
                .as("digito verificador errado e preservado como OUTRO")
                .containsExactly(new CodigoMigrado("7891000315508", "OUTRO", 0));
        assertThat(codigosDoProduto(alfanumerico)).containsExactly(new CodigoMigrado("ABC-123", "OUTRO", 0));
        assertThat(contar("SELECT count(*) FROM produto_codigos_barras")).isEqualTo(5);
    }

    @Test
    void codigoComEspacosInternosENormalizado() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", " 789 1000 315507 ");

        aplicarV7();

        assertThat(codigosDoProduto(produto)).containsExactly(new CodigoMigrado("7891000315507", "EAN13", 0));
    }

    @Test
    void produtoSemCodigoFicaSemCodigos() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long semCodigo = inserirProduto(empresa, "Sem codigo", null);
        long codigoVazio = inserirProduto(empresa, "Codigo vazio", "");

        aplicarV7();

        assertThat(codigosDoProduto(semCodigo)).isEmpty();
        assertThat(codigosDoProduto(codigoVazio)).isEmpty();
        assertThat(contar("SELECT count(*) FROM produto_codigos_barras")).isZero();
    }

    @Test
    void uuidsPreenchidosEUnicos() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        inserirProduto(empresaA, "Arroz", "7891000315507");
        inserirProduto(empresaA, "Feijao", null);
        inserirProduto(empresaB, "Acucar", null);

        aplicarV7();

        assertThat(contar("SELECT count(*) FROM produtos WHERE uuid IS NULL")).isZero();
        assertThat(contar("SELECT count(DISTINCT uuid) FROM produtos")).isEqualTo(3);
        assertThat(contar("""
                SELECT count(*) FROM information_schema.columns
                 WHERE table_name = 'produtos' AND column_name = 'uuid' AND is_nullable = 'NO'
                """)).as("uuid NOT NULL").isEqualTo(1);
    }

    @Test
    void colunasAntigasRemovidas() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        inserirProduto(empresa, "Arroz", "7891000315507");

        aplicarV7();

        assertThat(contar("""
                SELECT count(*) FROM information_schema.columns
                 WHERE table_name = 'produtos' AND column_name IN ('codigo_barras', 'categoria', 'unidade')
                """)).isZero();
        assertThat(contar("""
                SELECT count(*) FROM information_schema.columns
                 WHERE table_name = 'produtos' AND column_name IN ('uuid', 'nome_curto', 'fornecedor')
                """)).as("colunas novas presentes").isEqualTo(3);
        assertThat(contar("""
                SELECT count(*) FROM information_schema.table_constraints
                 WHERE constraint_name = 'uq_produto_empresa_codigo_barras'
                """)).isZero();
    }

    @Test
    void isolamentoPorEmpresa() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long produtoA = inserirProduto(empresaA, "Arroz A", "7891000315507");
        long produtoB = inserirProduto(empresaB, "Arroz B", "7891000315507");

        aplicarV7();

        assertThat(codigosDoProduto(produtoA)).containsExactly(new CodigoMigrado("7891000315507", "EAN13", 0));
        assertThat(codigosDoProduto(produtoB)).containsExactly(new CodigoMigrado("7891000315507", "EAN13", 0));
        assertThat(contar("SELECT count(*) FROM produto_codigos_barras WHERE empresa_id = " + empresaA))
                .isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM produto_codigos_barras WHERE empresa_id = " + empresaB))
                .isEqualTo(1);
        assertThat(contar("""
                SELECT count(*) FROM produto_codigos_barras c
                  JOIN produtos p ON p.id = c.produto_id
                 WHERE c.empresa_id <> p.empresa_id
                """)).as("nenhum codigo vinculado a produto de outra empresa").isZero();
    }

    @Test
    void constraintsNovas() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long produtoA = inserirProduto(empresaA, "Arroz", "7891000315507");
        long outroProdutoA = inserirProduto(empresaA, "Feijao", null);
        inserirProduto(empresaB, "Acucar", null);

        aplicarV7();

        assertViolacao(inserirCodigoSql(empresaA, outroProdutoA, "7891000315507", "EAN13", 0),
                "uq_codigo_barras_empresa", VIOLACAO_DE_UNICIDADE);
        assertViolacao(inserirCodigoSql(empresaA, produtoA, "7891000315507", "EAN13", 1),
                "uq_codigo_barras_empresa", VIOLACAO_DE_UNICIDADE);
        assertViolacao(inserirCodigoSql(empresaA, outroProdutoA, "12345", "QRCODE", 0),
                "ck_codigo_barras_formato", VIOLACAO_DE_CHECK);
        assertViolacao(inserirCodigoSql(empresaA, outroProdutoA, "123 45", "OUTRO", 0),
                "ck_codigo_barras_codigo", VIOLACAO_DE_CHECK);
        assertViolacao(inserirCodigoSql(empresaA, outroProdutoA, " 12345", "OUTRO", 0),
                "ck_codigo_barras_codigo", VIOLACAO_DE_CHECK);
        assertViolacao(inserirCodigoSql(empresaA, outroProdutoA, "", "OUTRO", 0),
                "ck_codigo_barras_codigo", VIOLACAO_DE_CHECK);
        assertViolacao(inserirCodigoSql(empresaA, outroProdutoA, "12345", "OUTRO", -1),
                "ck_codigo_barras_ordem", VIOLACAO_DE_CHECK);
        assertViolacao(inserirCodigoSql(empresaB, produtoA, "99999", "OUTRO", 0),
                "fk_codigo_barras_produto", VIOLACAO_DE_FK);
        assertViolacao("UPDATE produtos SET uuid = (SELECT uuid FROM produtos WHERE id = " + produtoA
                + ") WHERE id = " + outroProdutoA, "uq_produto_uuid", VIOLACAO_DE_UNICIDADE);

        executar("DELETE FROM produtos WHERE id = " + produtoA);
        assertThat(contar("SELECT count(*) FROM produto_codigos_barras WHERE produto_id = " + produtoA))
                .as("cascade apaga os codigos do produto excluido").isZero();
    }

    private record CodigoMigrado(String codigo, String formato, int ordem) {
    }

    private static String inserirCodigoSql(long empresaId, long produtoId, String codigo, String formato,
            int ordem) {
        return "INSERT INTO produto_codigos_barras (empresa_id, produto_id, codigo, formato, ordem) VALUES ("
                + empresaId + ", " + produtoId + ", '" + codigo + "', '" + formato + "', " + ordem + ")";
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

    /** Aplica exatamente ate a V7 (migrations futuras nao interferem no teste). */
    private static void aplicarV7() {
        flyway(VERSAO_V7).migrate();
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

    /**
     * Empresa FISICA com as colunas NOT NULL da V3 e a unidade UN (a V6 so cria
     * as unidades padrao das empresas que ja existiam quando ela rodou).
     */
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

    /** Produto no schema da V6: codigo de barras ainda em coluna unica de produtos. */
    private static long inserirProduto(long empresaId, String nome, String codigoBarras) throws SQLException {
        String sql = """
                INSERT INTO produtos (empresa_id, nome, codigo_barras, preco_venda, unidade_id)
                VALUES (?, ?, ?, 10.00,
                        (SELECT id FROM unidades_medida WHERE empresa_id = ? AND sigla = 'UN'))
                RETURNING id
                """;
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setLong(1, empresaId);
            comando.setString(2, nome);
            comando.setString(3, codigoBarras);
            comando.setLong(4, empresaId);
            return idRetornado(comando);
        }
    }

    private static long idRetornado(PreparedStatement comando) throws SQLException {
        try (ResultSet resultado = comando.executeQuery()) {
            resultado.next();
            return resultado.getLong(1);
        }
    }

    /** Codigos do produto em ordem, exigindo que estejam na mesma empresa do produto. */
    private static List<CodigoMigrado> codigosDoProduto(long produtoId) throws SQLException {
        String sql = """
                SELECT c.codigo, c.formato, c.ordem FROM produto_codigos_barras c
                  JOIN produtos p ON p.id = c.produto_id AND p.empresa_id = c.empresa_id
                 WHERE c.produto_id = ?
                 ORDER BY c.ordem, c.id
                """;
        List<CodigoMigrado> codigos = new ArrayList<>();
        try (Connection conexao = conectar(); PreparedStatement consulta = conexao.prepareStatement(sql)) {
            consulta.setLong(1, produtoId);
            try (ResultSet resultado = consulta.executeQuery()) {
                while (resultado.next()) {
                    codigos.add(new CodigoMigrado(resultado.getString("codigo"), resultado.getString("formato"),
                            resultado.getInt("ordem")));
                }
            }
        }
        return codigos;
    }
}
