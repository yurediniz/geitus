package com.geitus.app.cashier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
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
 * Teste de migracao da V16 (caixa, DEC-041) contra um PostgreSQL real
 * (Testcontainers), sem o contexto Spring.
 *
 * <p>Cada teste parte de um banco limpo no schema da V15, com duas empresas e
 * um usuario em cada, aplica a V16 e confere a carga do "Caixa 1", as
 * unicidades (indices parciais de sessao aberta), os {@code CHECK} de coerencia
 * por estado e os gatilhos de imutabilidade (docs/modules/caixa.md, 4 e 8).
 *
 * <p>O {@link JdbcTemplate} traduz o erro do banco para a hierarquia do Spring:
 * constraints e gatilhos (que usam o SQLSTATE 23000) viram
 * {@link DataIntegrityViolationException}. Requer Docker.
 */
@Testcontainers
class MigracaoV16IT {

    private static final String VERSAO_ANTERIOR_A_V16 = "15";
    private static final String VERSAO_V16 = "16";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private SingleConnectionDataSource conexao;
    private JdbcTemplate jdbc;
    private long empresaA;
    private long empresaB;
    private long usuarioA;

    @BeforeEach
    void prepararBancoNaV16ComDuasEmpresas() {
        Flyway ateV15 = flyway(VERSAO_ANTERIOR_A_V16);
        ateV15.clean();
        ateV15.migrate();
        conexao = new SingleConnectionDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(),
                POSTGRES.getPassword(), true);
        jdbc = new JdbcTemplate(conexao);
        empresaA = inserirEmpresa("Empresa A");
        empresaB = inserirEmpresa("Empresa B");
        usuarioA = inserirUsuario(empresaA, "a");
        inserirUsuario(empresaB, "b");
        flyway(VERSAO_V16).migrate();
    }

    @AfterEach
    void fecharConexao() {
        conexao.destroy();
    }

    // ---------- Pontos de caixa ----------

    @Test
    void criaCaixa1ParaCadaEmpresaExistente() {
        assertThat(contar("SELECT count(*) FROM pontos_caixa WHERE nome = 'Caixa 1' AND ativo AND uuid IS NOT NULL"
                + " AND criado_em IS NOT NULL")).isEqualTo(2);
        assertThat(contar("SELECT count(DISTINCT empresa_id) FROM pontos_caixa")).isEqualTo(2);
    }

    @Test
    void recusaNomeDePontoRepetidoSemDiferenciarMaiusculas() {
        assertViolacao(inserirPontoSql(empresaA, "caixa 1"), "uq_ponto_caixa_nome");

        jdbc.update(inserirPontoSql(empresaB, "Caixa 2"));
        jdbc.update(inserirPontoSql(empresaA, "Caixa 2"));
    }

    @Test
    void recusaNomeDePontoVazioOuComEspacosNasPontas() {
        assertViolacao(inserirPontoSql(empresaA, ""), "ck_ponto_caixa_nome");
        assertViolacao(inserirPontoSql(empresaA, " Caixa 3"), "ck_ponto_caixa_nome");
    }

    // ---------- Sessao aberta: uma por ponto e uma por usuario ----------

    @Test
    void recusaDuasSessoesAbertasNoMesmoPonto() {
        long outroUsuario = inserirUsuario(empresaA, "a2");
        long ponto = caixa1(empresaA);
        inserirSessaoEmConferencia(ponto, usuarioA);

        assertViolacao(inserirSessaoAbertaSql(ponto, outroUsuario), "uq_sessao_caixa_ponto_aberta");
    }

    @Test
    void recusaDuasSessoesAbertasDoMesmoUsuario() {
        long ponto2 = inserirPonto(empresaA, "Caixa 2");
        jdbc.update(inserirSessaoAbertaSql(caixa1(empresaA), usuarioA));

        assertViolacao(inserirSessaoAbertaSql(ponto2, usuarioA), "uq_sessao_caixa_usuario_aberta");
    }

    @Test
    void permiteNovaSessaoDepoisDeFechada() {
        long ponto = caixa1(empresaA);
        long sessao = inserirSessaoAberta(ponto, usuarioA);
        fecharSemDiferenca(sessao);

        jdbc.update(inserirSessaoAbertaSql(ponto, usuarioA));

        assertThat(contar("SELECT count(*) FROM sessoes_caixa WHERE empresa_id = " + empresaA)).isEqualTo(2);
    }

    @Test
    void recusaSessaoComUsuarioOuPontoDeOutraEmpresa() {
        long usuarioB = jdbc.queryForObject("SELECT id FROM usuario WHERE empresa_id = ?", Long.class, empresaB);

        assertViolacao(inserirSessaoAbertaSql(caixa1(empresaA), usuarioB), "fk_sessao_caixa_aberta_por");
        assertViolacao("INSERT INTO sessoes_caixa (uuid, empresa_id, ponto_caixa_id, status, aberta_por, aberta_em,"
                + " fundo_troco) VALUES (gen_random_uuid(), " + empresaB + ", " + caixa1(empresaA) + ", 'ABERTA', "
                + usuarioB + ", now(), 0)", "fk_sessao_caixa_ponto");
    }

    // ---------- Imutabilidade (gatilhos) ----------

    @Test
    void recusaUpdateEDeleteDeMovimento() {
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);
        jdbc.update(inserirMovimentoSql(sessao, "ABERTURA", "100.00", null, UUID.randomUUID()));

        assertViolacao("UPDATE movimentos_caixa SET valor = 1 WHERE sessao_caixa_id = " + sessao,
                "Movimento de caixa");
        assertViolacao("DELETE FROM movimentos_caixa WHERE sessao_caixa_id = " + sessao, "Movimento de caixa");
    }

    @Test
    void recusaDeleteDeSessao() {
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);

        assertViolacao("DELETE FROM sessoes_caixa WHERE id = " + sessao, "excluída");
    }

    @Test
    void recusaUpdateDeSessaoFechada() {
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);
        fecharSemDiferenca(sessao);

        assertViolacao("UPDATE sessoes_caixa SET justificativa = 'outra' WHERE id = " + sessao, "fechada");
    }

    @Test
    void recusaTrocarFundoTrocoOuPontoDeSessaoAberta() {
        long ponto2 = inserirPonto(empresaA, "Caixa 2");
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);

        assertViolacao("UPDATE sessoes_caixa SET fundo_troco = 1 WHERE id = " + sessao, "abertura");
        assertViolacao("UPDATE sessoes_caixa SET ponto_caixa_id = " + ponto2 + " WHERE id = " + sessao, "abertura");
        assertViolacao("UPDATE sessoes_caixa SET aberta_em = now() - interval '1 day' WHERE id = " + sessao,
                "abertura");
    }

    @Test
    void recusaTrocarContagemJaGravada() {
        long sessao = inserirSessaoEmConferencia(caixa1(empresaA), usuarioA);

        assertViolacao("UPDATE sessoes_caixa SET valor_contado = 101, diferenca = 1 WHERE id = " + sessao,
                "contagem");
    }

    @Test
    void recusaVoltarDeEmConferenciaParaAberta() {
        long sessao = inserirSessaoEmConferencia(caixa1(empresaA), usuarioA);

        assertViolacao("UPDATE sessoes_caixa SET status = 'ABERTA', fechamento_cego = NULL, valor_esperado = NULL,"
                + " valor_contado = NULL, diferenca = NULL, contada_por = NULL, contada_em = NULL WHERE id = "
                + sessao, "contagem");
    }

    @Test
    void permiteFecharSessaoEmConferenciaComJustificativa() {
        long sessao = inserirSessaoEmConferencia(caixa1(empresaA), usuarioA);

        jdbc.update("UPDATE sessoes_caixa SET status = 'FECHADA', justificativa = 'Troco a mais', fechada_por = "
                + usuarioA + ", fechada_em = now() WHERE id = " + sessao);

        assertThat(contar("SELECT count(*) FROM sessoes_caixa WHERE status = 'FECHADA'")).isEqualTo(1);
    }

    // ---------- Coerencia por estado (CHECK) ----------

    @Test
    void recusaFechadaComDiferencaSemJustificativa() {
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);

        assertViolacao(fecharSql(sessao, "100.00", "99.00", "-1.00", null), "ck_sessao_caixa_justificativa");
        assertViolacao(fecharSql(sessao, "100.00", "99.00", "-1.00", "'  '"), "ck_sessao_caixa_justificativa");
    }

    @Test
    void recusaDiferencaIncoerente() {
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);

        assertViolacao(fecharSql(sessao, "100.00", "99.00", "1.00", "'x'"), "ck_sessao_caixa_diferenca");
    }

    @Test
    void recusaEmConferenciaComDiferencaZero() {
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);

        assertViolacao("UPDATE sessoes_caixa SET status = 'EM_CONFERENCIA', fechamento_cego = true,"
                + " valor_esperado = 100, valor_contado = 100, diferenca = 0, contada_por = " + usuarioA
                + ", contada_em = now() WHERE id = " + sessao, "ck_sessao_caixa_em_conferencia");
    }

    @Test
    void recusaAbertaComCamposDaContagem() {
        assertViolacao("INSERT INTO sessoes_caixa (uuid, empresa_id, ponto_caixa_id, status, aberta_por, aberta_em,"
                + " fundo_troco, valor_contado) VALUES (gen_random_uuid(), " + empresaA + ", " + caixa1(empresaA)
                + ", 'ABERTA', " + usuarioA + ", now(), 0, 10)", "ck_sessao_caixa_aberta");
    }

    @Test
    void recusaFundoNegativo() {
        assertViolacao("INSERT INTO sessoes_caixa (uuid, empresa_id, ponto_caixa_id, status, aberta_por, aberta_em,"
                + " fundo_troco) VALUES (gen_random_uuid(), " + empresaA + ", " + caixa1(empresaA) + ", 'ABERTA', "
                + usuarioA + ", now(), -0.01)", "ck_sessao_caixa_fundo_troco");
    }

    // ---------- Movimentos ----------

    @Test
    void recusaSegundaAberturaNaMesmaSessao() {
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);
        jdbc.update(inserirMovimentoSql(sessao, "ABERTURA", "100.00", null, UUID.randomUUID()));

        assertViolacao(inserirMovimentoSql(sessao, "ABERTURA", "0.00", null, UUID.randomUUID()),
                "uq_movimento_caixa_abertura");
    }

    @Test
    void recusaChaveRepetidaNaEmpresa() {
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);
        UUID chave = UUID.randomUUID();
        jdbc.update(inserirMovimentoSql(sessao, "ABERTURA", "100.00", null, chave));

        assertViolacao(inserirMovimentoSql(sessao, "SUPRIMENTO", "10.00", "'Troco'", chave),
                "uq_movimento_caixa_chave");
    }

    @Test
    void recusaSangriaSemMotivo() {
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);

        assertViolacao(inserirMovimentoSql(sessao, "SANGRIA", "10.00", null, UUID.randomUUID()),
                "ck_movimento_caixa_motivo");
        assertViolacao(inserirMovimentoSql(sessao, "SANGRIA", "10.00", "''", UUID.randomUUID()),
                "ck_movimento_caixa_motivo");
        assertViolacao(inserirMovimentoSql(sessao, "ABERTURA", "10.00", "'Fundo'", UUID.randomUUID()),
                "ck_movimento_caixa_motivo");
    }

    @Test
    void recusaSuprimentoZero() {
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);

        assertViolacao(inserirMovimentoSql(sessao, "SUPRIMENTO", "0.00", "'Troco'", UUID.randomUUID()),
                "ck_movimento_caixa_valor");
        assertViolacao(inserirMovimentoSql(sessao, "ABERTURA", "-1.00", null, UUID.randomUUID()),
                "ck_movimento_caixa_valor");
        jdbc.update(inserirMovimentoSql(sessao, "ABERTURA", "0.00", null, UUID.randomUUID()));
    }

    // ---------- Movimento so em sessao aberta (D1) ----------

    @Test
    void recusaMovimentoEmSessaoEmConferencia() {
        long sessao = inserirSessaoEmConferencia(caixa1(empresaA), usuarioA);

        assertViolacao(inserirMovimentoSql(sessao, "SUPRIMENTO", "10.00", "'Troco'", UUID.randomUUID()),
                "sessão aberta");
    }

    @Test
    void recusaMovimentoEmSessaoFechada() {
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);
        fecharSemDiferenca(sessao);

        assertViolacao(inserirMovimentoSql(sessao, "SANGRIA", "10.00", "'Cofre'", UUID.randomUUID()),
                "sessão aberta");
    }

    @Test
    void recusaMovimentoComSessaoDeOutraEmpresa() {
        long sessaoDaA = inserirSessaoAberta(caixa1(empresaA), usuarioA);
        long usuarioB = jdbc.queryForObject("SELECT id FROM usuario WHERE empresa_id = ?", Long.class, empresaB);

        assertViolacao("INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, valor, motivo,"
                + " usuario_id, chave_idempotencia, criado_em) VALUES (gen_random_uuid(), " + empresaB + ", "
                + sessaoDaA + ", 'SUPRIMENTO', 10.00, 'Troco', " + usuarioB + ", gen_random_uuid(), now())",
                "fk_movimento_caixa_sessao");
    }

    // ---------- Regras do gatilho da sessao (D3) ----------

    @Test
    void recusaSessaoQueNaoNasceAberta() {
        assertViolacao("INSERT INTO sessoes_caixa (uuid, empresa_id, ponto_caixa_id, status, aberta_por, aberta_em,"
                + " fundo_troco, fechamento_cego, valor_esperado, valor_contado, diferenca, contada_por, contada_em,"
                + " fechada_por, fechada_em) VALUES (gen_random_uuid(), " + empresaA + ", " + caixa1(empresaA)
                + ", 'FECHADA', " + usuarioA + ", now(), 0, false, 0, 0, 0, " + usuarioA + ", now(), " + usuarioA
                + ", now())", "nasce aberta");
    }

    @Test
    void recusaFecharDiretoComDiferencaNoModoCego() {
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);

        assertViolacao("UPDATE sessoes_caixa SET status = 'FECHADA', fechamento_cego = true, valor_esperado = 100,"
                + " valor_contado = 99, diferenca = -1, contada_por = " + usuarioA + ", contada_em = now(),"
                + " justificativa = 'Falta', fechada_por = " + usuarioA + ", fechada_em = now() WHERE id = "
                + sessao, "conferência");
    }

    @Test
    void permiteFecharDiretoComDiferencaForaDoModoCego() {
        long sessao = inserirSessaoAberta(caixa1(empresaA), usuarioA);

        jdbc.update(fecharSql(sessao, "100.00", "99.00", "-1.00", "'Falta'"));

        assertThat(contar("SELECT count(*) FROM sessoes_caixa WHERE status = 'FECHADA'")).isEqualTo(1);
    }

    // ---------- Integridade entre empresas e unicidade (D6) ----------

    @Test
    void recusaConfiguracaoComUsuarioDeOutraEmpresa() {
        long usuarioB = jdbc.queryForObject("SELECT id FROM usuario WHERE empresa_id = ?", Long.class, empresaB);

        assertViolacao("INSERT INTO configuracoes_caixa (empresa_id, fechamento_cego, atualizado_por, atualizado_em)"
                + " VALUES (" + empresaA + ", true, " + usuarioB + ", now())", "fk_configuracao_caixa_usuario");
    }

    @Test
    void recusaSegundaAberturaDoUsuarioComAPrimeiraEmConferencia() {
        long ponto2 = inserirPonto(empresaA, "Caixa 2");
        inserirSessaoEmConferencia(caixa1(empresaA), usuarioA);

        assertViolacao(inserirSessaoAbertaSql(ponto2, usuarioA), "uq_sessao_caixa_usuario_aberta");
    }

    // ---------- Fuso ----------

    @Test
    void gravaEInstanteComFuso() {
        long ponto = caixa1(empresaA);
        jdbc.update("INSERT INTO sessoes_caixa (uuid, empresa_id, ponto_caixa_id, status, aberta_por, aberta_em,"
                + " fundo_troco) VALUES (gen_random_uuid(), " + empresaA + ", " + ponto + ", 'ABERTA', " + usuarioA
                + ", '2026-10-24T08:02:00-03:00', 0)");
        jdbc.execute("SET TIME ZONE 'UTC'");

        OffsetDateTime lida = jdbc.queryForObject("SELECT aberta_em FROM sessoes_caixa WHERE ponto_caixa_id = ?",
                OffsetDateTime.class, ponto);

        assertThat(lida).isEqualTo(OffsetDateTime.parse("2026-10-24T11:02:00Z"));
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private long caixa1(long empresa) {
        return jdbc.queryForObject("SELECT id FROM pontos_caixa WHERE empresa_id = ? AND nome = 'Caixa 1'",
                Long.class, empresa);
    }

    private static String inserirPontoSql(long empresa, String nome) {
        return "INSERT INTO pontos_caixa (uuid, empresa_id, nome, criado_em) VALUES (gen_random_uuid(), " + empresa
                + ", '" + nome + "', now())";
    }

    private long inserirPonto(long empresa, String nome) {
        return jdbc.queryForObject(inserirPontoSql(empresa, nome) + " RETURNING id", Long.class);
    }

    private String inserirSessaoAbertaSql(long ponto, long usuario) {
        return "INSERT INTO sessoes_caixa (uuid, empresa_id, ponto_caixa_id, status, aberta_por, aberta_em,"
                + " fundo_troco) VALUES (gen_random_uuid(), " + empresaA + ", " + ponto + ", 'ABERTA', " + usuario
                + ", now(), 100.00)";
    }

    private long inserirSessaoAberta(long ponto, long usuario) {
        return jdbc.queryForObject(inserirSessaoAbertaSql(ponto, usuario) + " RETURNING id", Long.class);
    }

    /** Sessao aberta e contada com falta de R$ 1,00 (esperado 100, contado 99). */
    private long inserirSessaoEmConferencia(long ponto, long usuario) {
        long sessao = inserirSessaoAberta(ponto, usuario);
        jdbc.update("UPDATE sessoes_caixa SET status = 'EM_CONFERENCIA', fechamento_cego = true,"
                + " valor_esperado = 100, valor_contado = 99, diferenca = -1, contada_por = " + usuario
                + ", contada_em = now() WHERE id = " + sessao);
        return sessao;
    }

    private String fecharSql(long sessao, String esperado, String contado, String diferenca, String justificativa) {
        return "UPDATE sessoes_caixa SET status = 'FECHADA', fechamento_cego = false, valor_esperado = " + esperado
                + ", valor_contado = " + contado + ", diferenca = " + diferenca + ", contada_por = " + usuarioA
                + ", contada_em = now(), justificativa = " + justificativa + ", fechada_por = " + usuarioA
                + ", fechada_em = now() WHERE id = " + sessao;
    }

    private void fecharSemDiferenca(long sessao) {
        jdbc.update(fecharSql(sessao, "100.00", "100.00", "0.00", null));
    }

    private String inserirMovimentoSql(long sessao, String tipo, String valor, String motivo, UUID chave) {
        return "INSERT INTO movimentos_caixa (uuid, empresa_id, sessao_caixa_id, tipo, valor, motivo, usuario_id,"
                + " chave_idempotencia, criado_em) VALUES (gen_random_uuid(), " + empresaA + ", " + sessao + ", '"
                + tipo + "', " + valor + ", " + motivo + ", " + usuarioA + ", '" + chave + "', now())";
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

    /** Empresa FISICA com as colunas NOT NULL da V3. */
    private long inserirEmpresa(String nome) {
        String slug = nome.toLowerCase().replaceAll("[^a-z0-9]", "");
        return jdbc.queryForObject("""
                INSERT INTO empresa (nome, representante_nome, representante_cpf, representante_telefone,
                                     representante_email, telefone, email, tipo_pessoa, endereco_cep,
                                     endereco_logradouro, endereco_numero, endereco_bairro,
                                     endereco_municipio, endereco_uf)
                VALUES (?, ?, '11144477735', '11987654321', ?, '1133224455', ?, 'FISICA', '01001000',
                        'Praça da Sé', 'S/N', 'Sé', 'São Paulo', 'SP')
                RETURNING id
                """, Long.class, nome, "Representante " + nome, "rep@" + slug + ".test", "contato@" + slug + ".test");
    }

    private long inserirUsuario(long empresa, String apelido) {
        return jdbc.queryForObject("""
                INSERT INTO usuario (empresa_id, nome, email, senha_hash, perfil)
                VALUES (?, ?, ?, 'hash-irrelevante', 'OPERADOR')
                RETURNING id
                """, Long.class, empresa, "Usuario " + apelido, apelido + empresa + "@v16.test");
    }
}
