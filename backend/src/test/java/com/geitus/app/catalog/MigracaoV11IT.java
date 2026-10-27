package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Teste de migracao da V11 (numero, codigo do produto, balanca e etiqueta,
 * Fase B2) contra um PostgreSQL real (Testcontainers), <b>sem Spring</b>.
 *
 * <p>Cada teste parte de um banco limpo no schema da V10, insere produtos e
 * clientes como existem hoje, aplica a V11 e confere via JDBC a numeracao por
 * empresa e por ordem de cadastro, a tabela {@code numeracoes} com o maximo de
 * cada tipo, os CHECKs e as unicidades
 * (docs/modules/produtos.md).
 *
 * <p>Requer Docker disponivel no ambiente.
 */
@Testcontainers
class MigracaoV11IT {

    private static final String VERSAO_ANTERIOR_A_V11 = "10";
    private static final String VERSAO_V11 = "11";
    private static final String VIOLACAO_DE_NOT_NULL = "23502";
    private static final String VIOLACAO_DE_UNICIDADE = "23505";
    private static final String VIOLACAO_DE_CHECK = "23514";
    private static final LocalDateTime INICIO = LocalDateTime.of(2026, 1, 10, 9, 0);

    /** {@code postgres:16} (Debian/glibc), a mesma imagem do banco de desenvolvimento. */
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

    @BeforeEach
    void prepararBancoNoSchemaDaV10() {
        Flyway flywayAteV10 = flyway(VERSAO_ANTERIOR_A_V11);
        flywayAteV10.clean();
        flywayAteV10.migrate();
    }

    // ---------- Numeracao dos existentes ----------

    /** A ordem e a do cadastro ({@code criado_em}), nao a do id; cada empresa comeca do 1. */
    @Test
    void produtosRecebemNumerosPorEmpresaEmOrdemDeCadastro() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long terceiroA = inserirProduto(empresaA, "Terceiro A", INICIO.plusHours(3));
        long primeiroB = inserirProduto(empresaB, "Primeiro B", INICIO.plusHours(1));
        long primeiroA = inserirProduto(empresaA, "Primeiro A", INICIO.plusHours(1));
        long segundoB = inserirProduto(empresaB, "Segundo B", INICIO.plusHours(2));
        long segundoA = inserirProduto(empresaA, "Segundo A", INICIO.plusHours(2));

        aplicarV11();

        assertThat(numero("produtos", primeiroA)).isEqualTo(1);
        assertThat(numero("produtos", segundoA)).isEqualTo(2);
        assertThat(numero("produtos", terceiroA)).isEqualTo(3);
        assertThat(numero("produtos", primeiroB)).isEqualTo(1);
        assertThat(numero("produtos", segundoB)).isEqualTo(2);
    }

    /** Cadastros no mesmo instante: o id desempata. */
    @Test
    void clientesRecebemNumeros() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long segundoA = inserirCliente(empresaA, "Bruno", INICIO.plusHours(2));
        long primeiroA = inserirCliente(empresaA, "Ana", INICIO);
        long empateA = inserirCliente(empresaA, "Carla", INICIO.plusHours(2));
        long primeiroB = inserirCliente(empresaB, "Duda", INICIO);

        aplicarV11();

        assertThat(numero("clientes", primeiroA)).isEqualTo(1);
        assertThat(numero("clientes", segundoA)).isEqualTo(2);
        assertThat(numero("clientes", empateA)).isEqualTo(3);
        assertThat(numero("clientes", primeiroB)).isEqualTo(1);
    }

    /** Uma linha por empresa e tipo com registros; empresa sem clientes nao tem a linha de CLIENTE. */
    @Test
    void numeracoesComOMaximo() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        inserirEmpresa("Empresa Vazia");
        for (int indice = 0; indice < 3; indice++) {
            inserirProduto(empresaA, "Produto A" + indice, INICIO.plusMinutes(indice));
        }
        inserirCliente(empresaA, "Ana", INICIO);
        inserirCliente(empresaA, "Bruno", INICIO.plusMinutes(1));
        inserirProduto(empresaB, "Produto B", INICIO);

        aplicarV11();

        assertThat(numeracoes()).containsExactly(
                new Numeracao(empresaA, "CLIENTE", 2),
                new Numeracao(empresaA, "PRODUTO", 3),
                new Numeracao(empresaB, "PRODUTO", 1));
        assertThatThrownBy(() -> executar("INSERT INTO numeracoes (empresa_id, tipo, ultimo_numero) VALUES ("
                + empresaB + ", 'VENDA', 0)"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_numeracao_tipo"));
        assertThatThrownBy(() -> executar("INSERT INTO numeracoes (empresa_id, tipo, ultimo_numero) VALUES ("
                + empresaB + ", 'CLIENTE', -1)"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_numeracao_nao_negativa"));
        assertThatThrownBy(() -> executar("INSERT INTO numeracoes (empresa_id, tipo, ultimo_numero) VALUES ("
                + empresaA + ", 'PRODUTO', 0)"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_UNICIDADE, "pk_numeracoes"));
    }

    @Test
    void numeroUnicoPorEmpresa() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        inserirProduto(empresaA, "Primeiro A", INICIO);
        long segundoA = inserirProduto(empresaA, "Segundo A", INICIO.plusMinutes(1));
        long clienteA = inserirCliente(empresaA, "Ana", INICIO);
        inserirCliente(empresaA, "Bruno", INICIO.plusMinutes(1));
        long primeiroB = inserirProduto(empresaB, "Primeiro B", INICIO);

        aplicarV11();

        assertThatThrownBy(() -> executar("UPDATE produtos SET numero = 1 WHERE id = " + segundoA))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_UNICIDADE, "uq_produto_empresa_numero"));
        assertThatThrownBy(() -> executar("UPDATE clientes SET numero = 2 WHERE id = " + clienteA))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_UNICIDADE, "uq_cliente_empresa_numero"));
        assertThatThrownBy(() -> executar("UPDATE produtos SET numero = 0 WHERE id = " + primeiroB))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_produto_numero_positivo"));
        assertThatThrownBy(() -> executar("UPDATE produtos SET numero = NULL WHERE id = " + primeiroB))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_NOT_NULL, "numero"));
        assertThatThrownBy(() -> executar("UPDATE clientes SET numero = NULL WHERE id = " + clienteA))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_NOT_NULL, "numero"));
    }

    // ---------- Codigo do produto e balanca ----------

    @Test
    void codigoNuloEBalancaFalse() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", INICIO);

        aplicarV11();

        assertThat(texto("SELECT coalesce(codigo::text, 'nulo') || '/' || vendido_balanca FROM produtos WHERE id = "
                + produto)).isEqualTo("nulo/false");
    }

    @Test
    void rejeitaBalancaSemCodigo() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Açúcar a granel", INICIO);

        aplicarV11();

        assertThatThrownBy(() -> executar("UPDATE produtos SET vendido_balanca = true WHERE id = " + produto))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_produto_balanca_exige_codigo"));
        assertThatCode(() -> executar("UPDATE produtos SET codigo = 542, vendido_balanca = true WHERE id = "
                + produto)).doesNotThrowAnyException();
    }

    @Test
    void rejeitaCodigoZeroEUmMilhao() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", INICIO);

        aplicarV11();

        assertThatThrownBy(() -> executar("UPDATE produtos SET codigo = 0 WHERE id = " + produto))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_produto_codigo_intervalo"));
        assertThatThrownBy(() -> executar("UPDATE produtos SET codigo = 1000000 WHERE id = " + produto))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_produto_codigo_intervalo"));
        assertThatCode(() -> executar("UPDATE produtos SET codigo = 1 WHERE id = " + produto))
                .doesNotThrowAnyException();
        assertThatCode(() -> executar("UPDATE produtos SET codigo = 999999 WHERE id = " + produto))
                .doesNotThrowAnyException();
    }

    /** Indice parcial: varios produtos sem codigo na empresa; o mesmo codigo em outra empresa e permitido. */
    @Test
    void codigoUnicoPorEmpresaMasRepetivelEntreEmpresas() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long primeiroA = inserirProduto(empresaA, "Primeiro A", INICIO);
        long segundoA = inserirProduto(empresaA, "Segundo A", INICIO.plusMinutes(1));
        inserirProduto(empresaA, "Sem codigo A", INICIO.plusMinutes(2));
        long primeiroB = inserirProduto(empresaB, "Primeiro B", INICIO);

        aplicarV11();

        executar("UPDATE produtos SET codigo = 542 WHERE id = " + primeiroA);
        assertThatThrownBy(() -> executar("UPDATE produtos SET codigo = 542 WHERE id = " + segundoA))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_UNICIDADE, "uq_produto_empresa_codigo"));
        assertThatCode(() -> executar("UPDATE produtos SET codigo = 542 WHERE id = " + primeiroB))
                .doesNotThrowAnyException();
        assertThat(texto("SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_produto_empresa_codigo'"))
                .contains("UNIQUE INDEX", "(empresa_id, codigo)", "WHERE (codigo IS NOT NULL)");
    }

    // ---------- Etiqueta de balanca ----------

    @Test
    void aceitaEtiquetaPadrao() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");

        aplicarV11();

        assertThatCode(() -> inserirEtiqueta(empresa, "2", 6, 0, "VALOR", 6, 3, false)).doesNotThrowAnyException();
        assertThatThrownBy(() -> inserirEtiqueta(empresa, "2", 6, 0, "VALOR", 6, 3, false))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_UNICIDADE, "uq_etiqueta_empresa"));
        long outra = inserirEmpresa("Empresa B");
        // Prefixo de 2 digitos: 2 + 4 + 0 + 6 + DV = 13.
        assertThatCode(() -> inserirEtiqueta(outra, "20", 4, 0, "VALOR", 6, 2, true)).doesNotThrowAnyException();
    }

    @Test
    void rejeitaEtiquetaComSomaDiferenteDe13() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");

        aplicarV11();

        assertThatThrownBy(() -> inserirEtiqueta(empresa, "2", 6, 0, "VALOR", 6, 3, true))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_etiqueta_tamanho_total"));
        assertThatThrownBy(() -> inserirEtiqueta(empresa, "20", 6, 0, "VALOR", 6, 3, false))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_etiqueta_tamanho_total"));
        assertThatThrownBy(() -> inserirEtiqueta(empresa, "2a", 5, 0, "VALOR", 6, 3, false))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_etiqueta_prefixo"));
        assertThatThrownBy(() -> inserirEtiqueta(empresa, "2", 7, 0, "VALOR", 5, 3, false))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_etiqueta_digitos_codigo"));
        assertThatThrownBy(() -> inserirEtiqueta(empresa, "2", 4, 3, "VALOR", 5, 3, false))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_etiqueta_digitos_preenchimento"));
        assertThatThrownBy(() -> inserirEtiqueta(empresa, "2", 6, 0, "QUANTIA", 6, 3, false))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_etiqueta_tipo_informacao"));
        assertThatThrownBy(() -> inserirEtiqueta(empresa, "2", 4, 0, "PESO", 8, 3, false))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_etiqueta_digitos_informacao"));
        assertThatThrownBy(() -> inserirEtiqueta(empresa, "2", 6, 0, "VALOR", 6, 1, false))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_etiqueta_casas_decimais"));
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private record Numeracao(long empresaId, String tipo, long ultimoNumero) {
    }

    private static void violou(Throwable erro, String sqlState, String trecho) {
        assertThat(erro).isInstanceOf(SQLException.class).hasMessageContaining(trecho);
        assertThat(((SQLException) erro).getSQLState()).isEqualTo(sqlState);
    }

    private static List<Numeracao> numeracoes() throws SQLException {
        List<Numeracao> linhas = new ArrayList<>();
        try (Connection conexao = conectar();
                Statement comando = conexao.createStatement();
                ResultSet resultado = comando.executeQuery(
                        "SELECT empresa_id, tipo, ultimo_numero FROM numeracoes ORDER BY empresa_id, tipo")) {
            while (resultado.next()) {
                linhas.add(new Numeracao(resultado.getLong(1), resultado.getString(2), resultado.getLong(3)));
            }
        }
        return linhas;
    }

    private static long numero(String tabela, long id) throws SQLException {
        return contar("SELECT numero FROM " + tabela + " WHERE id = " + id);
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

    /** Aplica exatamente ate a V11 (migrations futuras nao interferem no teste). */
    private static void aplicarV11() {
        flyway(VERSAO_V11).migrate();
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

    private static String texto(String sql) throws SQLException {
        try (Connection conexao = conectar();
                Statement comando = conexao.createStatement();
                ResultSet resultado = comando.executeQuery(sql)) {
            assertThat(resultado.next()).isTrue();
            return resultado.getString(1);
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

    /** Produto no schema da V10 (uuid pelo DEFAULT do banco), com a data de cadastro informada. */
    private static long inserirProduto(long empresaId, String nome, LocalDateTime criadoEm) throws SQLException {
        String sql = """
                INSERT INTO produtos (empresa_id, nome, preco_venda, unidade_id, busca_normalizada,
                                      nome_normalizado, criado_em)
                VALUES (?, ?, 10.00, (SELECT id FROM unidades_medida WHERE empresa_id = ? AND sigla = 'UN'),
                        lower(?), lower(?), ?)
                RETURNING id
                """;
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setLong(1, empresaId);
            comando.setString(2, nome);
            comando.setLong(3, empresaId);
            comando.setString(4, nome);
            comando.setString(5, nome);
            comando.setTimestamp(6, Timestamp.valueOf(criadoEm));
            return idRetornado(comando);
        }
    }

    /** Cliente no schema da V10, com a data de cadastro informada. */
    private static long inserirCliente(long empresaId, String nome, LocalDateTime criadoEm) throws SQLException {
        String sql = "INSERT INTO clientes (empresa_id, nome, criado_em) VALUES (?, ?, ?) RETURNING id";
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setLong(1, empresaId);
            comando.setString(2, nome);
            comando.setTimestamp(3, Timestamp.valueOf(criadoEm));
            return idRetornado(comando);
        }
    }

    private static void inserirEtiqueta(long empresaId, String prefixo, int digitosCodigo, int digitosPreenchimento,
            String tipoInformacao, int digitosInformacao, int casasDecimais, boolean digitoVerificador)
            throws SQLException {
        String sql = """
                INSERT INTO configuracoes_etiqueta_balanca (empresa_id, prefixo, digitos_codigo,
                        digitos_preenchimento, tipo_informacao, digitos_informacao, casas_decimais,
                        digito_verificador, atualizado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, now())
                """;
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setLong(1, empresaId);
            comando.setString(2, prefixo);
            comando.setInt(3, digitosCodigo);
            comando.setInt(4, digitosPreenchimento);
            comando.setString(5, tipoInformacao);
            comando.setInt(6, digitosInformacao);
            comando.setInt(7, casasDecimais);
            comando.setBoolean(8, digitoVerificador);
            comando.executeUpdate();
        }
    }

    private static long idRetornado(PreparedStatement comando) throws SQLException {
        try (ResultSet resultado = comando.executeQuery()) {
            resultado.next();
            return resultado.getLong(1);
        }
    }
}
