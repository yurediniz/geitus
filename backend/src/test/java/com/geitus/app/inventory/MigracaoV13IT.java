package com.geitus.app.inventory;

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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Teste de migracao da V13 (custo na entrada por compra, Fase B4) contra um
 * PostgreSQL real (Testcontainers), <b>sem Spring</b>.
 *
 * <p>Cada teste parte de um banco limpo no schema da V12, insere dados como
 * existem hoje, aplica a V13 e confere via JDBC o preenchimento da origem nas
 * linhas antigas de custo e as constraints novas do movimento, do produto e do
 * historico (docs/modules/produtos-custo-entrada.md, 5 e 9; DEC-038).
 *
 * <p>Requer Docker disponivel no ambiente.
 */
@Testcontainers
class MigracaoV13IT {

    private static final String VERSAO_ANTERIOR_A_V13 = "12";
    private static final String VERSAO_V13 = "13";
    private static final String VIOLACAO_DE_FK = "23503";
    private static final String VIOLACAO_DE_CHECK = "23514";
    private static final String SEM_CUSTO = "NULL";
    private static final String SEM_RETRATO = null;

    private static final AtomicLong NUMERO = new AtomicLong();

    /** {@code postgres:16} (Debian/glibc), a mesma imagem do banco de desenvolvimento. */
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

    @BeforeEach
    void prepararBancoNoSchemaDaV12() {
        Flyway flywayAteV12 = flyway(VERSAO_ANTERIOR_A_V13);
        flywayAteV12.clean();
        flywayAteV12.migrate();
    }

    // ---------- Preenchimento das linhas existentes ----------

    @Test
    void linhaAntigaDeCustoViraEdicaoEAsOutrasFicamSemOrigem() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", "9.50");
        long usuario = inserirUsuario(empresa);
        long custo = inserirHistoricoAntigo(empresa, produto, usuario, "CUSTO", null);
        long preco = inserirHistoricoAntigo(empresa, produto, usuario, "PRECO_VENDA", null);
        long embalagem = inserirHistoricoAntigo(empresa, produto, usuario, "PRECO_EMBALAGEM", "CX c/ 3 UN");

        aplicarV13();

        assertThat(texto("SELECT origem FROM produto_historico_precos WHERE id = " + custo)).isEqualTo("EDICAO");
        assertThat(texto("SELECT coalesce(origem, 'nula') FROM produto_historico_precos WHERE id = " + preco))
                .isEqualTo("nula");
        assertThat(texto("SELECT coalesce(origem, 'nula') FROM produto_historico_precos WHERE id = " + embalagem))
                .isEqualTo("nula");
        assertThat(texto("SELECT coalesce(custo_origem, 'nula') || '/' || (custo_origem_em IS NULL)"
                + " FROM produtos WHERE id = " + produto)).isEqualTo("nula/true");
    }

    /** Os movimentos de compra ja gravados nao tem custo e continuam validos; a obrigacao e da aplicacao. */
    @Test
    void compraAntigaSemCustoContinuaValida() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", null);
        long usuario = inserirUsuario(empresa);
        long antiga = inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "5", SEM_RETRATO, SEM_CUSTO,
                SEM_CUSTO);

        aplicarV13();

        assertThat(texto("SELECT (custo_informado IS NULL) || '/' || (custo_unitario IS NULL)"
                + " FROM movimentos_estoque WHERE id = " + antiga)).isEqualTo("true/true");
        assertThatCode(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "5", SEM_RETRATO,
                SEM_CUSTO, SEM_CUSTO)).doesNotThrowAnyException();
    }

    // ---------- Custo no movimento ----------

    @Test
    void custoSoNaEntradaPorCompraManual() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", null);
        long usuario = inserirUsuario(empresa);
        aplicarV13();

        assertThatCode(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "5", SEM_RETRATO,
                "10.00", "10.0000")).doesNotThrowAnyException();
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "SAIDA", "PERDA_AVARIA", "-5",
                SEM_RETRATO, "10.00", "10.0000"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_custo_da_compra"));
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "DEVOLUCAO_CLIENTE", "5",
                SEM_RETRATO, "10.00", "10.0000"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_custo_da_compra"));
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "AJUSTE", "CONTAGEM", "5", SEM_RETRATO,
                "10.00", "10.0000"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_custo_da_compra"));
    }

    @Test
    void custoComUmSoDosDoisCamposViolaACheck() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", null);
        long usuario = inserirUsuario(empresa);
        aplicarV13();

        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "5", SEM_RETRATO,
                "10.00", SEM_CUSTO))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_custo_completo"));
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "5", SEM_RETRATO,
                SEM_CUSTO, "10.0000"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_custo_completo"));
    }

    @Test
    void custoZeroOuNegativoViolaACheck() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", null);
        long usuario = inserirUsuario(empresa);
        aplicarV13();

        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "5", SEM_RETRATO,
                "0.00", "0.0000"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_custo_completo"));
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "5", SEM_RETRATO,
                "-1.00", "-1.0000"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_custo_completo"));
    }

    /** Review Focus 3: CX c/ 3 a R$ 100,00 grava 33,3333 por UN; outro arredondamento viola. */
    @Test
    void custoUnitarioCoerenteComORetratoDaEmbalagem() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Nexgard", null);
        long usuario = inserirUsuario(empresa);
        aplicarV13();

        assertThatCode(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "6", "3", "100.00",
                "33.3333")).doesNotThrowAnyException();
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "6", "3", "100.00",
                "33.3300"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_custo_unitario"));
        assertThatCode(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "36", "18", "180.00",
                "10.0000")).doesNotThrowAnyException();
        // Sem retrato, o custo unitario e o proprio informado.
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "5", SEM_RETRATO,
                "10.00", "9.0000"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_custo_unitario"));
    }

    // ---------- Origem do custo no produto ----------

    @Test
    void origemDoCustoNoProduto() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long comCusto = inserirProduto(empresa, "Arroz", "10.00");
        long semCusto = inserirProduto(empresa, "Feijão", null);
        aplicarV13();

        assertThatCode(() -> executar("UPDATE produtos SET custo_origem = 'ENTRADA_COMPRA', custo_origem_em = now()"
                + " WHERE id = " + comCusto)).doesNotThrowAnyException();
        assertThatCode(() -> executar("UPDATE produtos SET custo_origem = 'EDICAO', custo_origem_em = now()"
                + " WHERE id = " + comCusto)).doesNotThrowAnyException();
        assertThatThrownBy(() -> executar("UPDATE produtos SET custo_origem = 'EDICAO', custo_origem_em = now()"
                + " WHERE id = " + semCusto))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_produto_custo_origem_com_custo"));
        assertThatThrownBy(() -> executar("UPDATE produtos SET custo_origem = 'EDICAO', custo_origem_em = NULL"
                + " WHERE id = " + comCusto))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_produto_custo_origem_completa"));
        assertThatThrownBy(() -> executar("UPDATE produtos SET custo_origem = NULL, custo_origem_em = now()"
                + " WHERE id = " + comCusto))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_produto_custo_origem_completa"));
        assertThatThrownBy(() -> executar("UPDATE produtos SET custo_origem = 'IMPORTACAO', custo_origem_em = now()"
                + " WHERE id = " + comCusto))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_produto_custo_origem_valida"));
    }

    // ---------- Origem e movimento no historico ----------

    @Test
    void historicoDeCustoExigeAOrigemEAsOutrasLinhasNaoATem() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", null);
        long usuario = inserirUsuario(empresa);
        aplicarV13();

        assertThatThrownBy(() -> inserirHistorico(empresa, produto, usuario, "CUSTO", null, null))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_historico_preco_origem_do_custo"));
        assertThatThrownBy(() -> inserirHistorico(empresa, produto, usuario, "PRECO_VENDA", "EDICAO", null))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_historico_preco_origem_do_custo"));
        assertThatThrownBy(() -> inserirHistorico(empresa, produto, usuario, "CUSTO", "IMPORTACAO", null))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_historico_preco_origem_valida"));
        assertThatCode(() -> inserirHistorico(empresa, produto, usuario, "CUSTO", "EDICAO", null))
                .doesNotThrowAnyException();
        assertThatCode(() -> inserirHistorico(empresa, produto, usuario, "PRECO_VENDA", null, null))
                .doesNotThrowAnyException();
    }

    /** O movimento so liga linhas de origem ENTRADA_COMPRA, e toda linha ENTRADA_COMPRA tem o movimento. */
    @Test
    void movimentoDoHistoricoSoNaEntradaDeCompra() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", null);
        long usuario = inserirUsuario(empresa);
        aplicarV13();
        long compra = inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "5", SEM_RETRATO, "10.00",
                "10.0000");

        assertThatCode(() -> inserirHistorico(empresa, produto, usuario, "CUSTO", "ENTRADA_COMPRA", compra))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> inserirHistorico(empresa, produto, usuario, "CUSTO", "EDICAO", compra))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_historico_preco_movimento"));
        assertThatThrownBy(() -> inserirHistorico(empresa, produto, usuario, "CUSTO", "ENTRADA_COMPRA", null))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_historico_preco_movimento"));
        assertThatThrownBy(() -> inserirHistorico(empresa, produto, usuario, "PRECO_VENDA", null, compra))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_historico_preco_movimento"));
    }

    /** DEC-016: a FK composta impede ligar o historico a um movimento de outra empresa. */
    @Test
    void movimentoDeOutraEmpresaNoHistoricoViolaAFk() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long produtoDaA = inserirProduto(empresaA, "Arroz", null);
        long produtoDaB = inserirProduto(empresaB, "Arroz", null);
        long usuarioDaA = inserirUsuario(empresaA);
        long usuarioDaB = inserirUsuario(empresaB);
        aplicarV13();
        long compraDaB = inserirMovimento(empresaB, produtoDaB, usuarioDaB, "ENTRADA", "COMPRA", "5", SEM_RETRATO,
                "10.00", "10.0000");

        assertThatThrownBy(() -> inserirHistorico(empresaA, produtoDaA, usuarioDaA, "CUSTO", "ENTRADA_COMPRA",
                compraDaB))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_historico_preco_movimento"));
    }

    /** O movimento ligado ao historico e imutavel: a FK RESTRICT barra a remocao dele. */
    @Test
    void movimentoLigadoAoHistoricoNaoEApagado() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", null);
        long usuario = inserirUsuario(empresa);
        aplicarV13();
        long compra = inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "5", SEM_RETRATO, "10.00",
                "10.0000");
        inserirHistorico(empresa, produto, usuario, "CUSTO", "ENTRADA_COMPRA", compra);

        assertThatThrownBy(() -> executar("DELETE FROM movimentos_estoque WHERE id = " + compra))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_historico_preco_movimento"));
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

    /** Aplica exatamente ate a V13 (migrations futuras nao interferem no teste). */
    private static void aplicarV13() {
        flyway(VERSAO_V13).migrate();
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

    /** Produto no schema da V12, em UN, com o custo informado ({@code null} = sem custo). */
    private static long inserirProduto(long empresaId, String nome, String custo) throws SQLException {
        String sql = """
                INSERT INTO produtos (empresa_id, numero, nome, preco_venda, custo, unidade_id, busca_normalizada,
                                      nome_normalizado)
                VALUES (?, ?, ?, 20.00, ?::numeric,
                        (SELECT id FROM unidades_medida WHERE empresa_id = ? AND sigla = 'UN'), lower(?), lower(?))
                RETURNING id
                """;
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setLong(1, empresaId);
            comando.setLong(2, NUMERO.incrementAndGet());
            comando.setString(3, nome);
            comando.setString(4, custo);
            comando.setLong(5, empresaId);
            comando.setString(6, nome);
            comando.setString(7, nome);
            try (ResultSet resultado = comando.executeQuery()) {
                resultado.next();
                return resultado.getLong(1);
            }
        }
    }

    private static long inserirUsuario(long empresaId) throws SQLException {
        return idRetornado("INSERT INTO usuario (empresa_id, nome, email, senha_hash, perfil) VALUES (" + empresaId
                + ", 'Admin', 'admin" + empresaId + "@v13.test', 'hash', 'ADMIN') RETURNING id");
    }

    /** Linha de historico no schema da V12 (sem origem nem movimento). */
    private static long inserirHistoricoAntigo(long empresaId, long produtoId, long usuarioId, String campo,
            String rotulo) throws SQLException {
        return idRetornado("INSERT INTO produto_historico_precos (empresa_id, produto_id, campo, valor_anterior,"
                + " valor_novo, usuario_id, embalagem_rotulo) VALUES (" + empresaId + ", " + produtoId + ", '"
                + campo + "', NULL, 10.00, " + usuarioId + ", " + (rotulo == null ? "NULL" : "'" + rotulo + "'")
                + ") RETURNING id");
    }

    /** Linha de historico no schema da V13, com a origem e o movimento ({@code null} = sem). */
    private static void inserirHistorico(long empresaId, long produtoId, long usuarioId, String campo,
            String origem, Long movimentoId) throws SQLException {
        executar("INSERT INTO produto_historico_precos (empresa_id, produto_id, campo, valor_anterior, valor_novo,"
                + " usuario_id, origem, movimento_id) VALUES (" + empresaId + ", " + produtoId + ", '" + campo
                + "', NULL, 10.00, " + usuarioId + ", " + (origem == null ? "NULL" : "'" + origem + "'") + ", "
                + (movimentoId == null ? "NULL" : movimentoId) + ")");
    }

    /**
     * Movimento com a variacao informada (a saida parte do saldo que ela zera),
     * o retrato de uma embalagem de {@code porEmbalagem} unidades ({@code null}
     * = em unidades) e o custo ({@code "NULL"} = sem). Sem as colunas de custo
     * antes da V13.
     */
    private static long inserirMovimento(long empresaId, long produtoId, long usuarioId, String tipo, String motivo,
            String quantidade, String porEmbalagem, String custoInformado, String custoUnitario)
            throws SQLException {
        String anterior = "greatest(0, -(" + quantidade + "))";
        String retrato = porEmbalagem == null
                ? "NULL, NULL, NULL"
                : "'CX c/ " + porEmbalagem + " UN', " + porEmbalagem + ", abs(" + quantidade + ") / " + porEmbalagem;
        boolean comColunasDeCusto = !(SEM_CUSTO.equals(custoInformado) && SEM_CUSTO.equals(custoUnitario))
                || colunaExiste("movimentos_estoque", "custo_informado");
        String colunasDeCusto = comColunasDeCusto ? ", custo_informado, custo_unitario" : "";
        String valoresDeCusto = comColunasDeCusto ? ", " + custoInformado + ", " + custoUnitario : "";
        return idRetornado("INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,"
                + " saldo_anterior, saldo_novo, usuario_id, embalagem_rotulo, embalagem_quantidade,"
                + " quantidade_embalagens" + colunasDeCusto + ") VALUES (" + empresaId + ", " + produtoId + ", '"
                + tipo + "', '" + motivo + "', 'AJUSTE_MANUAL', " + quantidade + ", " + anterior + ", " + anterior
                + " + (" + quantidade + "), " + usuarioId + ", " + retrato + valoresDeCusto + ") RETURNING id");
    }

    private static boolean colunaExiste(String tabela, String coluna) throws SQLException {
        return Boolean.parseBoolean(texto("SELECT (count(*) > 0)::text FROM information_schema.columns"
                + " WHERE table_name = '" + tabela + "' AND column_name = '" + coluna + "'"));
    }
}
