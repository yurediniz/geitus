package com.geitus.app.catalog.imagem;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Teste de migracao da V15 (imagem do produto, Fase F) contra um PostgreSQL
 * real (Testcontainers), <b>sem Spring</b>: as CHECKs de tipo, tamanho e
 * dimensoes, a {@code versao} unica, as FKs compostas por empresa (DEC-016) e
 * a cascata na exclusao do produto (docs/modules/produtos-imagem.md, 3 e 8).
 *
 * <p>Cada teste parte de um banco limpo ate a V15. Requer Docker.
 */
@Testcontainers
class MigracaoV15IT {

    private static final String VERSAO_V15 = "15";
    private static final String VIOLACAO_DE_FK = "23503";
    private static final String VIOLACAO_DE_UNICIDADE = "23505";
    private static final String VIOLACAO_DE_CHECK = "23514";
    private static final int GRANDE_MAXIMA_EM_BYTES = 409_600;
    private static final int MINIATURA_MAXIMA_EM_BYTES = 40_960;

    private static final AtomicLong NUMERO = new AtomicLong();

    /** {@code postgres:16} (Debian/glibc), a mesma imagem do banco de desenvolvimento. */
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

    private long empresa;
    private long usuario;
    private long produto;

    @BeforeEach
    void prepararBancoNaV15() throws SQLException {
        Flyway flyway = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .cleanDisabled(false)
                .target(VERSAO_V15)
                .load();
        flyway.clean();
        flyway.migrate();
        empresa = inserirEmpresa("Empresa A");
        usuario = inserirUsuario(empresa);
        produto = inserirProduto(empresa);
    }

    @Test
    void gravaELeAImagemComAsDuasVersoes() throws SQLException {
        UUID versao = UUID.randomUUID();
        inserirImagem(new Linha(empresa, produto, usuario).versao(versao).tamanhos(GRANDE_MAXIMA_EM_BYTES,
                MINIATURA_MAXIMA_EM_BYTES).dimensoes(1200, 900, 200, 150));

        assertThat(texto("SELECT versao || '/' || tipo || '/' || octet_length(grande) || '/' || grande_largura"
                + " || 'x' || grande_altura || '/' || octet_length(miniatura) || '/' || miniatura_largura || 'x'"
                + " || miniatura_altura FROM produto_imagens WHERE produto_id = " + produto))
                .isEqualTo(versao + "/image/webp/409600/1200x900/40960/200x150");
    }

    @Test
    void umaImagemPorProduto() throws SQLException {
        inserirImagem(new Linha(empresa, produto, usuario));

        assertThatThrownBy(() -> inserirImagem(new Linha(empresa, produto, usuario)))
                .isInstanceOf(SQLException.class)
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(VIOLACAO_DE_UNICIDADE);
    }

    @Test
    void tipoForaDeWebpEJpegEBarrado() throws SQLException {
        inserirImagem(new Linha(empresa, produto, usuario).tipo("image/jpeg"));

        assertThatThrownBy(() -> inserirImagem(new Linha(empresa, inserirProduto(empresa), usuario)
                .tipo("image/png")))
                .isInstanceOf(SQLException.class)
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(VIOLACAO_DE_CHECK);
    }

    @Test
    void grandeAcimaDe400KbEBarrada() {
        assertThatThrownBy(() -> inserirImagem(new Linha(empresa, produto, usuario)
                .tamanhos(GRANDE_MAXIMA_EM_BYTES + 1, 100)))
                .isInstanceOf(SQLException.class)
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(VIOLACAO_DE_CHECK);
    }

    @Test
    void miniaturaAcimaDe40KbOuVaziaEBarrada() {
        assertThatThrownBy(() -> inserirImagem(new Linha(empresa, produto, usuario)
                .tamanhos(100, MINIATURA_MAXIMA_EM_BYTES + 1)))
                .isInstanceOf(SQLException.class)
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(VIOLACAO_DE_CHECK);
        assertThatThrownBy(() -> inserirImagem(new Linha(empresa, produto, usuario).tamanhos(100, 0)))
                .isInstanceOf(SQLException.class)
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(VIOLACAO_DE_CHECK);
    }

    @Test
    void miniaturaComMaisDe200PxEBarrada() {
        assertThatThrownBy(() -> inserirImagem(new Linha(empresa, produto, usuario).dimensoes(1200, 900, 201, 150)))
                .isInstanceOf(SQLException.class)
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(VIOLACAO_DE_CHECK);
    }

    @Test
    void grandeComMaisDe1200PxOuDimensaoZeroEBarrada() {
        assertThatThrownBy(() -> inserirImagem(new Linha(empresa, produto, usuario).dimensoes(800, 1201, 200, 150)))
                .isInstanceOf(SQLException.class)
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(VIOLACAO_DE_CHECK);
        assertThatThrownBy(() -> inserirImagem(new Linha(empresa, produto, usuario).dimensoes(0, 900, 200, 150)))
                .isInstanceOf(SQLException.class)
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(VIOLACAO_DE_CHECK);
    }

    @Test
    void versaoRepetidaEmOutroProdutoEBarrada() throws SQLException {
        UUID versao = UUID.randomUUID();
        inserirImagem(new Linha(empresa, produto, usuario).versao(versao));

        assertThatThrownBy(() -> inserirImagem(new Linha(empresa, inserirProduto(empresa), usuario).versao(versao)))
                .isInstanceOf(SQLException.class)
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(VIOLACAO_DE_UNICIDADE);
    }

    /** DEC-016: a imagem nao aponta para produto nem usuario de outra empresa. */
    @Test
    void produtoOuUsuarioDeOutraEmpresaEBarrado() throws SQLException {
        long outra = inserirEmpresa("Empresa B");
        long usuarioDaOutra = inserirUsuario(outra);

        assertThatThrownBy(() -> inserirImagem(new Linha(outra, produto, usuarioDaOutra)))
                .isInstanceOf(SQLException.class)
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(VIOLACAO_DE_FK);
        assertThatThrownBy(() -> inserirImagem(new Linha(empresa, produto, usuarioDaOutra)))
                .isInstanceOf(SQLException.class)
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(VIOLACAO_DE_FK);
    }

    @Test
    void excluirOProdutoApagaAImagem() throws SQLException {
        inserirImagem(new Linha(empresa, produto, usuario));

        executar("DELETE FROM produtos WHERE id = " + produto);

        assertThat(texto("SELECT count(*)::text FROM produto_imagens")).isEqualTo("0");
    }

    /** Os bytes ja vem comprimidos do navegador: o TOAST guarda sem tentar comprimir de novo. */
    @Test
    void bytesGuardadosSemNovaCompressao() throws SQLException {
        assertThat(texto("SELECT string_agg(attname || '=' || attstorage::text, ',' ORDER BY attname) FROM pg_attribute"
                + " WHERE attrelid = 'produto_imagens'::regclass AND attname IN ('grande', 'miniatura')"))
                .isEqualTo("grande=e,miniatura=e");
    }

    // ------------------------------------------------------------------
    // Infra: JDBC puro (sem Spring).
    // ------------------------------------------------------------------

    /** Linha de {@code produto_imagens} valida por padrao; cada teste muda so o que importa. */
    private static final class Linha {
        private final long empresaId;
        private final long produtoId;
        private final long usuarioId;
        private UUID versao = UUID.randomUUID();
        private String tipo = "image/webp";
        private int bytesDaGrande = 1000;
        private int bytesDaMiniatura = 100;
        private int[] dimensoes = {800, 600, 200, 150};

        Linha(long empresaId, long produtoId, long usuarioId) {
            this.empresaId = empresaId;
            this.produtoId = produtoId;
            this.usuarioId = usuarioId;
        }

        Linha versao(UUID valor) {
            this.versao = valor;
            return this;
        }

        Linha tipo(String valor) {
            this.tipo = valor;
            return this;
        }

        Linha tamanhos(int grande, int miniatura) {
            this.bytesDaGrande = grande;
            this.bytesDaMiniatura = miniatura;
            return this;
        }

        Linha dimensoes(int grandeLargura, int grandeAltura, int miniaturaLargura, int miniaturaAltura) {
            this.dimensoes = new int[] {grandeLargura, grandeAltura, miniaturaLargura, miniaturaAltura};
            return this;
        }
    }

    private static void inserirImagem(Linha linha) throws SQLException {
        String sql = """
                INSERT INTO produto_imagens (produto_id, empresa_id, versao, tipo, grande, grande_largura,
                                             grande_altura, miniatura, miniatura_largura, miniatura_altura,
                                             usuario_id, atualizado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
                """;
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setLong(1, linha.produtoId);
            comando.setLong(2, linha.empresaId);
            comando.setObject(3, linha.versao);
            comando.setString(4, linha.tipo);
            comando.setBytes(5, new byte[linha.bytesDaGrande]);
            comando.setInt(6, linha.dimensoes[0]);
            comando.setInt(7, linha.dimensoes[1]);
            comando.setBytes(8, new byte[linha.bytesDaMiniatura]);
            comando.setInt(9, linha.dimensoes[2]);
            comando.setInt(10, linha.dimensoes[3]);
            comando.setLong(11, linha.usuarioId);
            comando.executeUpdate();
        }
    }

    private static Connection conectar() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    private static void executar(String sql) throws SQLException {
        try (Connection conexao = conectar(); Statement comando = conexao.createStatement()) {
            comando.executeUpdate(sql);
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
        executar("INSERT INTO unidades_medida (empresa_id, sigla, descricao, fracionada) VALUES (" + empresaId
                + ", 'UN', 'Unidade', false)");
        return empresaId;
    }

    private static long inserirUsuario(long empresaId) throws SQLException {
        return idRetornado("INSERT INTO usuario (empresa_id, nome, email, senha_hash, perfil) VALUES (" + empresaId
                + ", 'Admin', 'admin" + empresaId + "@v15.test', 'hash', 'ADMIN') RETURNING id");
    }

    /** Produto no schema da V15, em UN. */
    private static long inserirProduto(long empresaId) throws SQLException {
        long numero = NUMERO.incrementAndGet();
        return idRetornado("INSERT INTO produtos (empresa_id, numero, nome, preco_venda, unidade_id,"
                + " busca_normalizada, nome_normalizado) VALUES (" + empresaId + ", " + numero + ", 'Produto "
                + numero + "', 20.00, (SELECT id FROM unidades_medida WHERE empresa_id = " + empresaId
                + " AND sigla = 'UN'), 'produto', 'produto') RETURNING id");
    }
}
