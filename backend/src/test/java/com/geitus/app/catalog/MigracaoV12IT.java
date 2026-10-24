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
import java.util.concurrent.atomic.AtomicLong;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Teste de migracao da V12 (embalagens do produto, Fase B3) contra um
 * PostgreSQL real (Testcontainers), <b>sem Spring</b>.
 *
 * <p>Cada teste parte de um banco limpo no schema da V11, insere produtos com
 * a unidade de compra como existe hoje, aplica a V12 e confere via JDBC a
 * conversao da unidade de compra em embalagem de compra, a parada com erro nos
 * casos inconvertiveis, a saida das colunas antigas e as constraints novas
 * (docs/modules/produtos-embalagens.md, 4 e 9).
 *
 * <p>Requer Docker disponivel no ambiente.
 */
@Testcontainers
class MigracaoV12IT {

    private static final String VERSAO_ANTERIOR_A_V12 = "11";
    private static final String VERSAO_V12 = "12";
    private static final String VIOLACAO_DE_FK = "23503";
    private static final String VIOLACAO_DE_UNICIDADE = "23505";
    private static final String VIOLACAO_DE_CHECK = "23514";

    private static final AtomicLong NUMERO = new AtomicLong();

    /** {@code postgres:16} (Debian/glibc), a mesma imagem do banco de desenvolvimento. */
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

    @BeforeEach
    void prepararBancoNoSchemaDaV11() {
        Flyway flywayAteV11 = flyway(VERSAO_ANTERIOR_A_V12);
        flywayAteV11.clean();
        flywayAteV11.migrate();
    }

    // ---------- Migracao da unidade de compra ----------

    @Test
    void unidadeDeCompraComFatorViraEmbalagemDeCompra() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long un = unidade(empresa, "UN");
        long cx = inserirUnidade(empresa, "CX", false);
        long produto = inserirProduto(empresa, "Sachê", un, cx, "18.0000");

        aplicarV12();

        assertThat(texto("SELECT empresa_id || '/' || unidade_id || '/' || quantidade || '/' || de_compra || '/'"
                + " || coalesce(preco::text, 'nulo') || '/' || ordem || '/' || (uuid IS NOT NULL)"
                + " FROM produto_embalagens WHERE produto_id = " + produto))
                .isEqualTo(empresa + "/" + cx + "/18.000/true/nulo/0/true");
    }

    /** Unidade de venda fracionada aceita o fator com ate 3 casas (SC c/ 25,5 KG). */
    @Test
    void fatorFracionadoEmUnidadeFracionadaVira25Virgula5() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long kg = inserirUnidade(empresa, "KG", true);
        long sc = inserirUnidade(empresa, "SC", false);
        long produto = inserirProduto(empresa, "Ração", kg, sc, "25.5000");

        aplicarV12();

        assertThat(texto("SELECT quantidade::text FROM produto_embalagens WHERE produto_id = " + produto))
                .isEqualTo("25.500");
    }

    @Test
    void fatorUmComAMesmaUnidadeNaoGeraEmbalagem() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long un = unidade(empresa, "UN");
        inserirProduto(empresa, "Arroz", un, un, "1.0000");
        inserirProduto(empresa, "Feijão", un, null, null);

        aplicarV12();

        assertThat(contar("SELECT count(*) FROM produto_embalagens")).isZero();
    }

    @Test
    void colunasDaUnidadeDeCompraSaem() throws SQLException {
        inserirEmpresa("Empresa A");

        aplicarV12();

        assertThat(contar("""
                SELECT count(*) FROM information_schema.columns
                 WHERE table_name = 'produtos' AND column_name IN ('unidade_compra_id', 'fator_conversao')
                """)).isZero();
        assertThat(contar("SELECT count(*) FROM pg_indexes WHERE indexname = 'idx_produto_unidade_compra'"))
                .isZero();
    }

    @Test
    void fatorAteUmComUnidadeDiferenteFazAMigracaoFalhar() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long un = unidade(empresa, "UN");
        long cx = inserirUnidade(empresa, "CX", false);
        inserirProduto(empresa, "Meia caixa", un, cx, "0.5000");
        inserirProduto(empresa, "Caixa com 1", un, cx, "1.0000");

        assertThatThrownBy(MigracaoV12IT::aplicarV12)
                .isInstanceOf(FlywayException.class)
                .hasMessageContaining("2 produto(s)");
        assertThat(contar("SELECT count(*) FROM information_schema.columns WHERE table_name = 'produtos'"
                + " AND column_name = 'unidade_compra_id'")).isEqualTo(1);
    }

    @Test
    void fatorFracionadoEmUnidadeNaoFracionadaFazAMigracaoFalhar() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long un = unidade(empresa, "UN");
        long cx = inserirUnidade(empresa, "CX", false);
        inserirProduto(empresa, "Caixa com 2,5", un, cx, "2.5000");

        assertThatThrownBy(MigracaoV12IT::aplicarV12)
                .isInstanceOf(FlywayException.class)
                .hasMessageContaining("1 produto(s)");
    }

    @Test
    void fatorComQuatroCasasFazAMigracaoFalhar() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long kg = inserirUnidade(empresa, "KG", true);
        long sc = inserirUnidade(empresa, "SC", false);
        inserirProduto(empresa, "Saco quebrado", kg, sc, "25.5005");

        assertThatThrownBy(MigracaoV12IT::aplicarV12)
                .isInstanceOf(FlywayException.class)
                .hasMessageContaining("1 produto(s)");
    }

    /** A mesma unidade com fator diferente de 1 nao tem embalagem possivel: para em vez de descartar. */
    @Test
    void mesmaUnidadeComFatorDiferenteDeUmFazAMigracaoFalhar() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long un = unidade(empresa, "UN");
        inserirProduto(empresa, "Incoerente", un, un, "12.0000");

        assertThatThrownBy(MigracaoV12IT::aplicarV12)
                .isInstanceOf(FlywayException.class)
                .hasMessageContaining("1 produto(s)");
    }

    // ---------- Constraints da embalagem ----------

    @Test
    void checksDaEmbalagem() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long un = unidade(empresa, "UN");
        long cx = inserirUnidade(empresa, "CX", false);
        long fd = inserirUnidade(empresa, "FD", false);
        long produto = inserirProduto(empresa, "Nexgard", un, null, null);

        aplicarV12();

        assertThatThrownBy(() -> inserirEmbalagem(empresa, produto, cx, "1", null, false, 0))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_embalagem_quantidade"));
        assertThatThrownBy(() -> inserirEmbalagem(empresa, produto, cx, "3", "0", false, 0))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_embalagem_preco"));
        assertThatThrownBy(() -> inserirEmbalagem(empresa, produto, cx, "3", null, false, -1))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_embalagem_ordem"));
        inserirEmbalagem(empresa, produto, cx, "3", "209.90", true, 0);
        assertThatThrownBy(() -> inserirEmbalagem(empresa, produto, fd, "12", null, true, 1))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_UNICIDADE, "uq_embalagem_de_compra"));
        assertThatThrownBy(() -> inserirEmbalagem(empresa, produto, cx, "3.000", null, false, 1))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_UNICIDADE, "uq_embalagem_produto_unidade_quantidade"));
        assertThatCode(() -> inserirEmbalagem(empresa, produto, cx, "6", null, false, 1)).doesNotThrowAnyException();
    }

    /**
     * Review Focus 2: duas embalagens trocam de unidade e quantidade no mesmo
     * salvamento. A unicidade e conferida no fim da transacao (DEFERRABLE).
     */
    @Test
    void trocaDeQuantidadeEntreEmbalagensNaMesmaTransacao() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long un = unidade(empresa, "UN");
        long cx = inserirUnidade(empresa, "CX", false);
        long produto = inserirProduto(empresa, "Nexgard", un, null, null);
        aplicarV12();
        long tres = inserirEmbalagem(empresa, produto, cx, "3", null, false, 0);
        long seis = inserirEmbalagem(empresa, produto, cx, "6", null, false, 1);

        try (Connection conexao = conectar(); Statement comando = conexao.createStatement()) {
            conexao.setAutoCommit(false);
            comando.executeUpdate("UPDATE produto_embalagens SET quantidade = 6 WHERE id = " + tres);
            comando.executeUpdate("UPDATE produto_embalagens SET quantidade = 3 WHERE id = " + seis);
            conexao.commit();
        }

        assertThat(contar("SELECT quantidade FROM produto_embalagens WHERE id = " + tres)).isEqualTo(6);
    }

    @Test
    void embalagemComUnidadeDeOutraEmpresaViolaFk() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long un = unidade(empresaA, "UN");
        long cxDaB = inserirUnidade(empresaB, "CX", false);
        long produto = inserirProduto(empresaA, "Nexgard", un, null, null);

        aplicarV12();

        assertThatThrownBy(() -> inserirEmbalagem(empresaA, produto, cxDaB, "3", null, false, 0))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_embalagem_unidade"));
    }

    // ---------- Codigos de barras das embalagens ----------

    @Test
    void codigoComEmbalagemDeOutroProdutoViolaFk() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long un = unidade(empresa, "UN");
        long cx = inserirUnidade(empresa, "CX", false);
        long nexgard = inserirProduto(empresa, "Nexgard", un, null, null);
        long bravecto = inserirProduto(empresa, "Bravecto", un, null, null);
        aplicarV12();
        long caixaDoNexgard = inserirEmbalagem(empresa, nexgard, cx, "3", null, false, 0);

        assertThatThrownBy(() -> inserirCodigo(empresa, bravecto, caixaDoNexgard, "7891000315507"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_codigo_barras_embalagem"));
        assertThatCode(() -> inserirCodigo(empresa, nexgard, caixaDoNexgard, "7891000315507"))
                .doesNotThrowAnyException();
    }

    @Test
    void mesmoCodigoNaUnidadeENaEmbalagemViolaAUnicidade() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long un = unidade(empresa, "UN");
        long cx = inserirUnidade(empresa, "CX", false);
        long nexgard = inserirProduto(empresa, "Nexgard", un, null, null);
        aplicarV12();
        long caixa = inserirEmbalagem(empresa, nexgard, cx, "3", null, false, 0);
        inserirCodigo(empresa, nexgard, null, "7891000315507");

        assertThatThrownBy(() -> inserirCodigo(empresa, nexgard, caixa, "7891000315507"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_UNICIDADE, "uq_codigo_barras_empresa"));
    }

    @Test
    void removerAEmbalagemApagaOsCodigos() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long un = unidade(empresa, "UN");
        long cx = inserirUnidade(empresa, "CX", false);
        long nexgard = inserirProduto(empresa, "Nexgard", un, null, null);
        aplicarV12();
        long caixa = inserirEmbalagem(empresa, nexgard, cx, "3", null, false, 0);
        inserirCodigo(empresa, nexgard, caixa, "7891000315507");
        inserirCodigo(empresa, nexgard, null, "96385074");

        executar("DELETE FROM produto_embalagens WHERE id = " + caixa);

        assertThat(contar("SELECT count(*) FROM produto_codigos_barras WHERE produto_id = " + nexgard)).isEqualTo(1);
    }

    // ---------- Historico de precos ----------

    @Test
    void historicoDoPrecoDaEmbalagemExigeORotulo() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long un = unidade(empresa, "UN");
        long produto = inserirProduto(empresa, "Nexgard", un, null, null);
        long usuario = inserirUsuario(empresa);
        aplicarV12();

        assertThatThrownBy(() -> inserirHistorico(empresa, produto, usuario, "PRECO_EMBALAGEM", null))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_historico_preco_embalagem_rotulo"));
        assertThatThrownBy(() -> inserirHistorico(empresa, produto, usuario, "PRECO_VENDA", "CX c/ 3 UN"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_historico_preco_embalagem_rotulo"));
        assertThatThrownBy(() -> inserirHistorico(empresa, produto, usuario, "PRECO_ATACADO", null))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_historico_preco_campo"));
        assertThatCode(() -> inserirHistorico(empresa, produto, usuario, "PRECO_EMBALAGEM", "CX c/ 3 UN"))
                .doesNotThrowAnyException();
        assertThatCode(() -> inserirHistorico(empresa, produto, usuario, "PRECO_VENDA", null))
                .doesNotThrowAnyException();
    }

    // ---------- Retrato da embalagem no movimento ----------

    @Test
    void retratoDaEmbalagemNoMovimento() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long un = unidade(empresa, "UN");
        long produto = inserirProduto(empresa, "Sachê", un, null, null);
        long usuario = inserirUsuario(empresa);
        aplicarV12();

        assertThatCode(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "36", "'CX c/ 18 UN'",
                "18", "2")).doesNotThrowAnyException();
        assertThatCode(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "5", "NULL", "NULL",
                "NULL")).doesNotThrowAnyException();
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "36",
                "'CX c/ 18 UN'", "18", "NULL"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_embalagem_completa"));
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "36", "NULL",
                "18", "2"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_embalagem_completa"));
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "1",
                "'CX c/ 1 UN'", "1", "1"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_embalagem_completa"));
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "AJUSTE", "CONTAGEM", "36",
                "'CX c/ 18 UN'", "18", "2"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_embalagem_tipo"));
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "35",
                "'CX c/ 18 UN'", "18", "2"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_embalagem_total"));
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private static void violou(Throwable erro, String sqlState, String trecho) {
        assertThat(erro).isInstanceOf(SQLException.class).hasMessageContaining(trecho);
        assertThat(((SQLException) erro).getSQLState()).isEqualTo(sqlState);
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

    /** Aplica exatamente ate a V12 (migrations futuras nao interferem no teste). */
    private static void aplicarV12() {
        flyway(VERSAO_V12).migrate();
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

    private static long idRetornado(String sql) throws SQLException {
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
            try (ResultSet resultado = comando.executeQuery()) {
                resultado.next();
                empresaId = resultado.getLong(1);
            }
        }
        inserirUnidade(empresaId, "UN", false);
        return empresaId;
    }

    private static long inserirUnidade(long empresaId, String sigla, boolean fracionada) throws SQLException {
        return idRetornado("INSERT INTO unidades_medida (empresa_id, sigla, descricao, fracionada) VALUES ("
                + empresaId + ", '" + sigla + "', 'Unidade " + sigla + "', " + fracionada + ") RETURNING id");
    }

    private static long unidade(long empresaId, String sigla) throws SQLException {
        return contar("SELECT id FROM unidades_medida WHERE empresa_id = " + empresaId + " AND sigla = '" + sigla
                + "'");
    }

    /** Produto no schema da V11, com a unidade de compra e o fator ({@code null} = sem). */
    private static long inserirProduto(long empresaId, String nome, long unidadeId, Long unidadeCompraId,
            String fator) throws SQLException {
        String sql = """
                INSERT INTO produtos (empresa_id, numero, nome, preco_venda, unidade_id, unidade_compra_id,
                                      fator_conversao, busca_normalizada, nome_normalizado)
                VALUES (?, ?, ?, 10.00, ?, ?, ?::numeric, lower(?), lower(?))
                RETURNING id
                """;
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setLong(1, empresaId);
            comando.setLong(2, NUMERO.incrementAndGet());
            comando.setString(3, nome);
            comando.setLong(4, unidadeId);
            comando.setObject(5, unidadeCompraId);
            comando.setString(6, fator);
            comando.setString(7, nome);
            comando.setString(8, nome);
            try (ResultSet resultado = comando.executeQuery()) {
                resultado.next();
                return resultado.getLong(1);
            }
        }
    }

    private static long inserirEmbalagem(long empresaId, long produtoId, long unidadeId, String quantidade,
            String preco, boolean deCompra, int ordem) throws SQLException {
        return idRetornado("INSERT INTO produto_embalagens (uuid, empresa_id, produto_id, unidade_id, quantidade,"
                + " preco, de_compra, ordem) VALUES (gen_random_uuid(), " + empresaId + ", " + produtoId + ", "
                + unidadeId + ", " + quantidade + ", " + (preco == null ? "NULL" : preco) + ", " + deCompra + ", "
                + ordem + ") RETURNING id");
    }

    private static void inserirCodigo(long empresaId, long produtoId, Long embalagemId, String codigo)
            throws SQLException {
        executar("INSERT INTO produto_codigos_barras (empresa_id, produto_id, embalagem_id, codigo, formato, ordem)"
                + " VALUES (" + empresaId + ", " + produtoId + ", " + (embalagemId == null ? "NULL" : embalagemId)
                + ", '" + codigo + "', 'EAN13', 0)");
    }

    private static long inserirUsuario(long empresaId) throws SQLException {
        return idRetornado("INSERT INTO usuario (empresa_id, nome, email, senha_hash, perfil) VALUES (" + empresaId
                + ", 'Admin', 'admin" + empresaId + "@v12.test', 'hash', 'ADMIN') RETURNING id");
    }

    private static void inserirHistorico(long empresaId, long produtoId, long usuarioId, String campo,
            String rotulo) throws SQLException {
        executar("INSERT INTO produto_historico_precos (empresa_id, produto_id, campo, valor_anterior, valor_novo,"
                + " usuario_id, embalagem_rotulo) VALUES (" + empresaId + ", " + produtoId + ", '" + campo
                + "', NULL, 10.00, " + usuarioId + ", " + (rotulo == null ? "NULL" : "'" + rotulo + "'") + ")");
    }

    /** Movimento partindo do saldo 0 (entrada) ou de 0 para a quantidade (ajuste). */
    private static void inserirMovimento(long empresaId, long produtoId, long usuarioId, String tipo, String motivo,
            String quantidade, String rotulo, String porEmbalagem, String embalagens) throws SQLException {
        executar("INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,"
                + " saldo_anterior, saldo_novo, usuario_id, embalagem_rotulo, embalagem_quantidade,"
                + " quantidade_embalagens) VALUES (" + empresaId + ", " + produtoId + ", '" + tipo + "', '" + motivo
                + "', 'AJUSTE_MANUAL', " + quantidade + ", 0, " + quantidade + ", " + usuarioId + ", " + rotulo
                + ", " + porEmbalagem + ", " + embalagens + ")");
    }
}
