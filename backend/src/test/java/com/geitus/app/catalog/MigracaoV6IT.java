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
import java.util.Map;
import java.util.TreeMap;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Teste de migracao de dados da V6 (unidades de medida e categorias) contra um
 * PostgreSQL real (Testcontainers), <b>sem Spring</b>.
 *
 * <p>Cada teste parte de um banco limpo no schema da V5, insere empresas e
 * produtos com {@code unidade}/{@code categoria} em texto livre (como existem
 * hoje), aplica a V6 e confere via JDBC a conversao para FKs: nenhum produto
 * sem unidade, nenhuma unidade ou categoria duplicada, vinculos corretos e
 * isolados por empresa (DEC-016), colunas antigas preservadas.
 *
 * <p>Requer Docker disponivel no ambiente.
 */
@Testcontainers
class MigracaoV6IT {

    private static final String VERSAO_ANTERIOR_A_V6 = "5";
    private static final String VERSAO_V6 = "6";
    private static final String VIOLACAO_DE_UNICIDADE = "23505";
    private static final String VIOLACAO_DE_CHECK = "23514";
    private static final String VIOLACAO_DE_FK = "23503";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @BeforeEach
    void prepararBancoNoSchemaDaV5() {
        Flyway flywayAteV5 = flyway(VERSAO_ANTERIOR_A_V6);
        flywayAteV5.clean();
        flywayAteV5.migrate();
    }

    @Test
    void unidadesPadraoCriadasParaCadaEmpresa() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");

        aplicarV6();

        for (long empresaId : List.of(empresaA, empresaB)) {
            Map<String, Boolean> fracionadaPorSigla = fracionadaPorSigla(empresaId);
            assertThat(fracionadaPorSigla).containsOnlyKeys(
                    "UN", "KG", "G", "L", "ML", "M", "CX", "PCT", "DZ", "FD");
            assertThat(fracionadaPorSigla).containsEntry("KG", true).containsEntry("G", true)
                    .containsEntry("L", true).containsEntry("ML", true).containsEntry("M", true)
                    .containsEntry("UN", false).containsEntry("CX", false).containsEntry("PCT", false)
                    .containsEntry("DZ", false).containsEntry("FD", false);
        }
        assertThat(contar("SELECT count(*) FROM unidades_medida WHERE uuid IS NULL OR ativo IS NOT TRUE"))
                .isZero();
        assertThat(contar("SELECT count(DISTINCT uuid) FROM unidades_medida")).isEqualTo(20);
    }

    @Test
    void textosDeUnidadeMapeadosParaPadroes() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        List<String> textos = List.of("un", " Un ", "UND", "unidade", "pç", "kg", "Kilo", "LT", "Caixa",
                " kg ", "KILO", "PEÇA", "Dúzia", "litros", "FD");
        List<String> siglasEsperadas = List.of("UN", "UN", "UN", "UN", "UN", "KG", "KG", "L", "CX",
                "KG", "KG", "UN", "DZ", "L", "FD");
        List<Long> produtos = new ArrayList<>();
        for (String texto : textos) {
            produtos.add(inserirProduto(empresa, "Produto " + texto, texto, null));
        }

        aplicarV6();

        for (int i = 0; i < produtos.size(); i++) {
            assertThat(siglaDaUnidadeDoProduto(produtos.get(i)))
                    .as("unidade do texto '%s'", textos.get(i))
                    .isEqualTo(siglasEsperadas.get(i));
        }
        assertThat(contar("SELECT count(*) FROM unidades_medida")).as("nenhuma unidade nova").isEqualTo(10);
    }

    @Test
    void textoDeUnidadeDesconhecidoViraUnidadeNova() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long primeiro = inserirProduto(empresa, "Cimento", "Saco 50", null);
        long segundo = inserirProduto(empresa, "Cal", "saco 50 ", null);

        aplicarV6();

        assertThat(siglaDaUnidadeDoProduto(primeiro)).isEqualTo("SACO 50");
        assertThat(siglaDaUnidadeDoProduto(segundo)).isEqualTo("SACO 50");
        try (Connection conexao = conectar();
                PreparedStatement consulta = conexao.prepareStatement(
                        "SELECT descricao, fracionada, ativo FROM unidades_medida WHERE empresa_id = ? AND sigla = ?")) {
            consulta.setLong(1, empresa);
            consulta.setString(2, "SACO 50");
            try (ResultSet resultado = consulta.executeQuery()) {
                assertThat(resultado.next()).isTrue();
                assertThat(resultado.getString("descricao")).isEqualTo("Saco 50");
                assertThat(resultado.getBoolean("fracionada")).isFalse();
                assertThat(resultado.getBoolean("ativo")).isTrue();
                assertThat(resultado.next()).as("uma unica unidade nova").isFalse();
            }
        }
        assertThat(contar("SELECT count(*) FROM unidades_medida")).isEqualTo(11);
    }

    @Test
    void produtoSemUnidadeRecebeUN() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long semUnidade = inserirProduto(empresa, "Sem unidade", null, null);
        long unidadeVazia = inserirProduto(empresa, "Unidade vazia", "", null);
        long unidadeEmBranco = inserirProduto(empresa, "Unidade em branco", "   ", null);

        aplicarV6();

        assertThat(siglaDaUnidadeDoProduto(semUnidade)).isEqualTo("UN");
        assertThat(siglaDaUnidadeDoProduto(unidadeVazia)).isEqualTo("UN");
        assertThat(siglaDaUnidadeDoProduto(unidadeEmBranco)).isEqualTo("UN");
        assertThat(contar("SELECT count(*) FROM produtos WHERE unidade_id IS NULL")).isZero();
        assertThat(contar("SELECT count(*) FROM unidades_medida")).as("nenhuma unidade vazia criada").isEqualTo(10);
    }

    @Test
    void categoriasViramRaizesSemDuplicar() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long arroz = inserirProduto(empresa, "Arroz", "UN", "Mercearia");
        long feijao = inserirProduto(empresa, "Feijao", "UN", "mercearia ");
        long acucar = inserirProduto(empresa, "Acucar", "UN", "MERCEARIA");
        long refrigerante = inserirProduto(empresa, "Refrigerante", "UN", "Bebidas");
        long semCategoria = inserirProduto(empresa, "Sem categoria", "UN", null);
        long categoriaVazia = inserirProduto(empresa, "Categoria vazia", "UN", "");
        long categoriaEmBranco = inserirProduto(empresa, "Categoria em branco", "UN", "   ");
        long racao = inserirProduto(empresa, "Racao seca", "UN", "Ração");
        long racaoMaiuscula = inserirProduto(empresa, "Racao umida", "UN", "RAÇÃO");
        long racaoComEspacos = inserirProduto(empresa, "Petisco", "UN", " ração ");

        aplicarV6();

        assertThat(nomesDasCategorias(empresa)).containsExactlyInAnyOrder("Mercearia", "Bebidas", "Ração");
        assertThat(contar("SELECT count(*) FROM categorias WHERE parent_id IS NOT NULL")).isZero();
        assertThat(contar("SELECT count(*) FROM categorias WHERE uuid IS NULL OR ativo IS NOT TRUE")).isZero();
        assertThat(nomeDaCategoriaDoProduto(arroz)).isEqualTo("Mercearia");
        assertThat(nomeDaCategoriaDoProduto(feijao)).isEqualTo("Mercearia");
        assertThat(nomeDaCategoriaDoProduto(acucar)).isEqualTo("Mercearia");
        assertThat(nomeDaCategoriaDoProduto(refrigerante)).isEqualTo("Bebidas");
        assertThat(nomeDaCategoriaDoProduto(semCategoria)).isNull();
        assertThat(nomeDaCategoriaDoProduto(categoriaVazia)).isNull();
        assertThat(nomeDaCategoriaDoProduto(categoriaEmBranco)).isNull();
        assertThat(nomeDaCategoriaDoProduto(racao)).isEqualTo("Ração");
        assertThat(nomeDaCategoriaDoProduto(racaoMaiuscula)).isEqualTo("Ração");
        assertThat(nomeDaCategoriaDoProduto(racaoComEspacos)).isEqualTo("Ração");
    }

    @Test
    void isolamentoPorEmpresaNaMigracao() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long produtoA = inserirProduto(empresaA, "Arroz A", "Saco 50", "Mercearia");
        long produtoB = inserirProduto(empresaB, "Arroz B", "saco 50", "mercearia");

        aplicarV6();

        assertThat(nomesDasCategorias(empresaA)).containsExactly("Mercearia");
        assertThat(nomesDasCategorias(empresaB)).containsExactly("mercearia");
        assertThat(contar("SELECT count(*) FROM unidades_medida WHERE sigla = 'SACO 50'"))
                .as("uma unidade nova por empresa").isEqualTo(2);
        assertThat(contar("""
                SELECT count(*) FROM produtos p
                  LEFT JOIN categorias c ON c.id = p.categoria_id
                  JOIN unidades_medida u ON u.id = p.unidade_id
                 WHERE c.empresa_id <> p.empresa_id OR u.empresa_id <> p.empresa_id
                """)).as("nenhum vinculo com outra empresa").isZero();
        assertThat(nomeDaCategoriaDoProduto(produtoA)).isEqualTo("Mercearia");
        assertThat(nomeDaCategoriaDoProduto(produtoB)).isEqualTo("mercearia");
    }

    @Test
    void colunasAntigasPreservadas() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long comTextos = inserirProduto(empresa, "Feijao", " Un ", "mercearia ");
        long semTextos = inserirProduto(empresa, "Sem textos", null, null);

        aplicarV6();

        assertThat(textosAntigosDoProduto(comTextos)).containsExactly(" Un ", "mercearia ");
        assertThat(textosAntigosDoProduto(semTextos)).containsExactly(null, null);
    }

    @Test
    void constraintsNovas() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", "UN", "Mercearia");

        aplicarV6();

        assertViolacao("INSERT INTO categorias (empresa_id, nome) VALUES (" + empresa + ", 'mercearia')",
                "uq_categoria_irmaos", VIOLACAO_DE_UNICIDADE);
        assertViolacao("UPDATE produtos SET fator_conversao = 12 WHERE id = " + produto,
                "ck_produto_compra_coerente", VIOLACAO_DE_CHECK);
        assertViolacao("UPDATE produtos SET fator_conversao = 0, unidade_compra_id = unidade_id WHERE id = "
                + produto, "ck_produto_fator_positivo", VIOLACAO_DE_CHECK);
        assertViolacao("UPDATE produtos SET fator_conversao = -1, unidade_compra_id = unidade_id WHERE id = "
                + produto, "ck_produto_fator_positivo", VIOLACAO_DE_CHECK);
        assertViolacao(inserirUnidadeSql(empresa, "sc", "Saco"), "ck_unidade_sigla_maiuscula", VIOLACAO_DE_CHECK);
        assertViolacao(inserirUnidadeSql(empresa, " SC", "Saco"), "ck_unidade_sigla_maiuscula", VIOLACAO_DE_CHECK);
        assertViolacao(inserirUnidadeSql(empresa, "", "Saco"), "ck_unidade_sigla_maiuscula", VIOLACAO_DE_CHECK);
        assertViolacao(inserirUnidadeSql(empresa, "SC", "  "), "ck_unidade_descricao_valida", VIOLACAO_DE_CHECK);
        assertViolacao(inserirUnidadeSql(empresa, "KG", "Quilo"), "uq_unidade_empresa_sigla", VIOLACAO_DE_UNICIDADE);
        assertViolacao("INSERT INTO categorias (empresa_id, nome) VALUES (" + empresa + ", ' Bebidas')",
                "ck_categoria_nome_valido", VIOLACAO_DE_CHECK);
        assertViolacao("INSERT INTO categorias (empresa_id, nome) VALUES (" + empresa + ", '')",
                "ck_categoria_nome_valido", VIOLACAO_DE_CHECK);
        assertViolacao("UPDATE categorias SET parent_id = id WHERE id = " + idDaCategoria(empresa, "Mercearia"),
                "ck_categoria_pai_diferente", VIOLACAO_DE_CHECK);
    }

    @Test
    void exclusaoBloqueadaPorVinculos() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        inserirProduto(empresa, "Arroz", "UN", "Mercearia");

        aplicarV6();

        long mercearia = idDaCategoria(empresa, "Mercearia");
        executar("INSERT INTO categorias (empresa_id, parent_id, nome) VALUES (" + empresa + ", " + mercearia
                + ", 'Graos')");
        long graos = idDaCategoria(empresa, "Graos");
        executar("UPDATE produtos SET categoria_id = NULL");
        assertViolacao("DELETE FROM categorias WHERE id = " + mercearia, "fk_categoria_pai", VIOLACAO_DE_FK);
        executar("UPDATE produtos SET categoria_id = " + graos);
        assertViolacao("DELETE FROM categorias WHERE id = " + graos, "fk_produto_categoria", VIOLACAO_DE_FK);
        assertViolacao("DELETE FROM unidades_medida WHERE id = " + idDaUnidade(empresa, "UN"),
                "fk_produto_unidade", VIOLACAO_DE_FK);
        long caixa = idDaUnidade(empresa, "CX");
        executar("UPDATE produtos SET unidade_compra_id = " + caixa + ", fator_conversao = 12");
        assertViolacao("DELETE FROM unidades_medida WHERE id = " + caixa,
                "fk_produto_unidade_compra", VIOLACAO_DE_FK);
    }

    @Test
    void vinculosComOutraEmpresaRejeitadosPeloBanco() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long produtoA = inserirProduto(empresaA, "Arroz A", "UN", "Mercearia");
        inserirProduto(empresaB, "Arroz B", "UN", "Bebidas");

        aplicarV6();

        long unidadeDaB = idDaUnidade(empresaB, "KG");
        long categoriaDaB = idDaCategoria(empresaB, "Bebidas");
        assertViolacao("UPDATE produtos SET unidade_id = " + unidadeDaB + " WHERE id = " + produtoA,
                "fk_produto_unidade", VIOLACAO_DE_FK);
        assertViolacao("UPDATE produtos SET categoria_id = " + categoriaDaB + " WHERE id = " + produtoA,
                "fk_produto_categoria", VIOLACAO_DE_FK);
        assertViolacao("UPDATE produtos SET unidade_compra_id = " + unidadeDaB
                + ", fator_conversao = 12 WHERE id = " + produtoA, "fk_produto_unidade_compra", VIOLACAO_DE_FK);
        assertViolacao("INSERT INTO categorias (empresa_id, parent_id, nome) VALUES (" + empresaA + ", "
                + categoriaDaB + ", 'Refrigerantes')", "fk_categoria_pai", VIOLACAO_DE_FK);
        assertViolacao("UPDATE categorias SET parent_id = " + categoriaDaB + " WHERE id = "
                + idDaCategoria(empresaA, "Mercearia"), "fk_categoria_pai", VIOLACAO_DE_FK);
    }

    private static String inserirUnidadeSql(long empresaId, String sigla, String descricao) {
        return "INSERT INTO unidades_medida (empresa_id, sigla, descricao) VALUES (" + empresaId + ", '" + sigla
                + "', '" + descricao + "')";
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

    /** Aplica exatamente ate a V6 (migrations futuras nao interferem no teste). */
    private static void aplicarV6() {
        flyway(VERSAO_V6).migrate();
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

    /** Empresa FISICA com as colunas NOT NULL da V3 (mesmos dados do helper do ProdutoRepositoryIT). */
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
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setString(1, nome);
            comando.setString(2, "Representante " + nome);
            comando.setString(3, "rep@" + slug + ".test");
            comando.setString(4, "contato@" + slug + ".test");
            return idRetornado(comando);
        }
    }

    /** Produto no schema da V5: unidade e categoria ainda em texto livre. */
    private static long inserirProduto(long empresaId, String nome, String unidade, String categoria)
            throws SQLException {
        String sql = """
                INSERT INTO produtos (empresa_id, nome, unidade, categoria, preco_venda)
                VALUES (?, ?, ?, ?, 10.00)
                RETURNING id
                """;
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setLong(1, empresaId);
            comando.setString(2, nome);
            comando.setString(3, unidade);
            comando.setString(4, categoria);
            return idRetornado(comando);
        }
    }

    private static long idRetornado(PreparedStatement comando) throws SQLException {
        try (ResultSet resultado = comando.executeQuery()) {
            resultado.next();
            return resultado.getLong(1);
        }
    }

    private static Map<String, Boolean> fracionadaPorSigla(long empresaId) throws SQLException {
        Map<String, Boolean> fracionadaPorSigla = new TreeMap<>();
        try (Connection conexao = conectar();
                PreparedStatement consulta = conexao.prepareStatement(
                        "SELECT sigla, fracionada FROM unidades_medida WHERE empresa_id = ?")) {
            consulta.setLong(1, empresaId);
            try (ResultSet resultado = consulta.executeQuery()) {
                while (resultado.next()) {
                    fracionadaPorSigla.put(resultado.getString("sigla"), resultado.getBoolean("fracionada"));
                }
            }
        }
        return fracionadaPorSigla;
    }

    /** Sigla da unidade do produto, exigindo que a unidade seja da mesma empresa do produto. */
    private static String siglaDaUnidadeDoProduto(long produtoId) throws SQLException {
        return valorDoProduto("""
                SELECT u.sigla FROM produtos p
                  JOIN unidades_medida u ON u.id = p.unidade_id AND u.empresa_id = p.empresa_id
                 WHERE p.id = ?
                """, produtoId);
    }

    /** Nome da categoria do produto (ou null), exigindo que seja da mesma empresa do produto. */
    private static String nomeDaCategoriaDoProduto(long produtoId) throws SQLException {
        return valorDoProduto("""
                SELECT c.nome FROM produtos p
                  LEFT JOIN categorias c ON c.id = p.categoria_id AND c.empresa_id = p.empresa_id
                 WHERE p.id = ?
                """, produtoId);
    }

    private static String valorDoProduto(String sql, long produtoId) throws SQLException {
        try (Connection conexao = conectar(); PreparedStatement consulta = conexao.prepareStatement(sql)) {
            consulta.setLong(1, produtoId);
            try (ResultSet resultado = consulta.executeQuery()) {
                assertThat(resultado.next()).as("produto %d encontrado", produtoId).isTrue();
                return resultado.getString(1);
            }
        }
    }

    private static long idDaCategoria(long empresaId, String nome) throws SQLException {
        return idPorEmpresaETexto("SELECT id FROM categorias WHERE empresa_id = ? AND nome = ?", empresaId, nome);
    }

    private static long idDaUnidade(long empresaId, String sigla) throws SQLException {
        return idPorEmpresaETexto("SELECT id FROM unidades_medida WHERE empresa_id = ? AND sigla = ?",
                empresaId, sigla);
    }

    private static long idPorEmpresaETexto(String sql, long empresaId, String texto) throws SQLException {
        try (Connection conexao = conectar(); PreparedStatement consulta = conexao.prepareStatement(sql)) {
            consulta.setLong(1, empresaId);
            consulta.setString(2, texto);
            try (ResultSet resultado = consulta.executeQuery()) {
                assertThat(resultado.next()).as("registro '%s' da empresa %d", texto, empresaId).isTrue();
                return resultado.getLong(1);
            }
        }
    }

    private static List<String> nomesDasCategorias(long empresaId) throws SQLException {
        List<String> nomes = new ArrayList<>();
        try (Connection conexao = conectar();
                PreparedStatement consulta = conexao.prepareStatement(
                        "SELECT nome FROM categorias WHERE empresa_id = ? ORDER BY id")) {
            consulta.setLong(1, empresaId);
            try (ResultSet resultado = consulta.executeQuery()) {
                while (resultado.next()) {
                    nomes.add(resultado.getString("nome"));
                }
            }
        }
        return nomes;
    }

    private static List<String> textosAntigosDoProduto(long produtoId) throws SQLException {
        try (Connection conexao = conectar();
                PreparedStatement consulta = conexao.prepareStatement(
                        "SELECT unidade, categoria FROM produtos WHERE id = ?")) {
            consulta.setLong(1, produtoId);
            try (ResultSet resultado = consulta.executeQuery()) {
                resultado.next();
                List<String> textos = new ArrayList<>();
                textos.add(resultado.getString("unidade"));
                textos.add(resultado.getString("categoria"));
                return textos;
            }
        }
    }
}
