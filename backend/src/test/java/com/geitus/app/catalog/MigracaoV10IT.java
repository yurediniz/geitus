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

import com.geitus.app.shared.busca.TextoDeBusca;

/**
 * Teste de migracao da V10 (colunas normalizadas da busca, Fase E) contra um
 * PostgreSQL real (Testcontainers), <b>sem Spring</b>.
 *
 * <p>Cada teste parte de um banco limpo no schema da V9, insere produtos como
 * existem hoje, aplica a V10 e confere via JDBC que a conversao SQL do
 * preenchimento da o MESMO resultado que {@link TextoDeBusca} (a que a
 * aplicacao usa dali em diante) — para todas as letras acentuadas do
 * {@code translate} da V10 e para os 30 produtos do catalogo de exemplo do
 * banco de desenvolvimento —, que as colunas ficam {@code NOT NULL} e que os
 * indices existem (docs/modules/produtos-listagem.md, 3 e 4.1).
 *
 * <p>Requer Docker disponivel no ambiente.
 */
@Testcontainers
class MigracaoV10IT {

    private static final String VERSAO_ANTERIOR_A_V10 = "9";
    private static final String VERSAO_V10 = "10";
    private static final String VIOLACAO_DE_NOT_NULL = "23502";

    /** As mesmas letras do {@code translate} da V10, na mesma ordem. */
    private static final String LETRAS_ACENTUADAS = "ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñÝýÿ";

    /** Combinacoes tipicas do portugues, maiusculas e espacos que nao sao o espaco comum. */
    private static final List<String> COMBINACOES = List.of("Pão de Açúcar", "MAÇÃ", "Café Pilão", "Ñandu", "Ýoga",
            "AÇÚCAR  CRISTAL   UNIÃO", "Leite\u00a0Integral", "Ração\u2007Úmida\u202fSachê", "Óleo\tde Soja",
            "Cafe\u0301 decomposto", "100% Algodão_P", "Pé-de-moleque");

    /** Catalogo de exemplo do banco de desenvolvimento (nome, SKU e marca; nenhum tem nome curto). */
    private static final List<ProdutoDeExemplo> CATALOGO_DE_EXEMPLO = List.of(
            new ProdutoDeExemplo("Arroz Branco Tipo 1 5kg", "DEMO-MER-001", "Tio João"),
            new ProdutoDeExemplo("Feijão Carioca 1kg", "DEMO-MER-002", "Camil"),
            new ProdutoDeExemplo("Açúcar Refinado 1kg", "DEMO-MER-003", "União"),
            new ProdutoDeExemplo("Óleo de Soja 900ml", "DEMO-MER-004", "Liza"),
            new ProdutoDeExemplo("Café Torrado e Moído 500g", "DEMO-MER-005", "Pilão"),
            new ProdutoDeExemplo("Leite Integral 1L", "DEMO-MER-006", "Italac"),
            new ProdutoDeExemplo("Queijo Muçarela Fatiado", "DEMO-MER-007", "Tirolez"),
            new ProdutoDeExemplo("Banana Prata", "DEMO-MER-008", null),
            new ProdutoDeExemplo("Detergente Líquido 500ml", "DEMO-MER-009", "Ypê"),
            new ProdutoDeExemplo("Refrigerante Cola 2L", "DEMO-MER-010", "Coca-Cola"),
            new ProdutoDeExemplo("Ração Cães Adultos 15kg", "DEMO-PET-001", "Golden"),
            new ProdutoDeExemplo("Ração Gatos Castrados 10kg", "DEMO-PET-002", "Premier"),
            new ProdutoDeExemplo("Sachê Gatos Carne 85g", "DEMO-PET-003", "Whiskas"),
            new ProdutoDeExemplo("Petisco Bifinho 65g", "DEMO-PET-004", "Keldog"),
            new ProdutoDeExemplo("Areia Higiênica 4kg", "DEMO-PET-005", "Pipicat"),
            new ProdutoDeExemplo("Xampu Neutro Pet 500ml", "DEMO-PET-006", "Sanol"),
            new ProdutoDeExemplo("Coleira Antipulgas Média", "DEMO-PET-007", "Seresto"),
            new ProdutoDeExemplo("Brinquedo Bola de Borracha", "DEMO-PET-008", null),
            new ProdutoDeExemplo("Comedouro Inox 500ml", "DEMO-PET-009", "Chalesco"),
            new ProdutoDeExemplo("Cama Pet Retangular M", "DEMO-PET-010", null),
            new ProdutoDeExemplo("Camiseta Básica Algodão P", "DEMO-ROU-001", "Hering"),
            new ProdutoDeExemplo("Camiseta Básica Algodão M", "DEMO-ROU-002", "Hering"),
            new ProdutoDeExemplo("Camiseta Básica Algodão G", "DEMO-ROU-003", "Hering"),
            new ProdutoDeExemplo("Calça Jeans Skinny 38", "DEMO-ROU-004", "Levi's"),
            new ProdutoDeExemplo("Calça Jeans Skinny 40", "DEMO-ROU-005", "Levi's"),
            new ProdutoDeExemplo("Vestido Midi Floral M", "DEMO-ROU-006", null),
            new ProdutoDeExemplo("Moletom Canguru G", "DEMO-ROU-007", "Nike"),
            new ProdutoDeExemplo("Meia Cano Médio Kit 3", "DEMO-ROU-008", "Lupo"),
            new ProdutoDeExemplo("Boné Aba Curva", "DEMO-ROU-009", null),
            new ProdutoDeExemplo("Jaqueta Corta-vento P", "DEMO-ROU-010", "Adidas"));

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @BeforeEach
    void prepararBancoNoSchemaDaV9() {
        Flyway flywayAteV9 = flyway(VERSAO_ANTERIOR_A_V10);
        flywayAteV9.clean();
        flywayAteV9.migrate();
    }

    @Test
    void preencheBuscaENomeNormalizados() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        inserirProduto(empresa, new Cadastro("Ração Golden Adulto", "RAÇÃO GLD", "P000001", "Premier"));
        inserirProduto(empresa, new Cadastro("Arroz", null, null, null));
        // Texto vazio vindo de cadastros antigos (SKU e marca) nao deixa espaco sobrando.
        inserirProduto(empresa, new Cadastro("Feijão  Preto", null, "", ""));

        aplicarV10();

        assertThat(normalizadosGravados()).containsExactly(
                new Normalizados("racao golden adulto", "racao golden adulto racao gld p000001 premier"),
                new Normalizados("arroz", "arroz"),
                new Normalizados("feijao preto", "feijao preto"));
    }

    /** Cada letra do {@code translate}, sozinha e em palavra, e as combinacoes: SQL igual ao Java. */
    @Test
    void sqlEquivaleAoJavaParaTodasAsLetrasAcentuadas() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        List<Cadastro> cadastros = new ArrayList<>();
        LETRAS_ACENTUADAS.codePoints().mapToObj(Character::toString).forEach(letra -> {
            cadastros.add(new Cadastro(letra, null, null, null));
            cadastros.add(new Cadastro("Pal" + letra + "vra " + letra.repeat(2), letra, null, "Marc" + letra));
        });
        COMBINACOES.forEach(texto -> cadastros.add(new Cadastro(texto, null, null, texto)));
        for (Cadastro cadastro : cadastros) {
            inserirProduto(empresa, cadastro);
        }

        aplicarV10();

        assertThat(normalizadosGravados()).containsExactlyElementsOf(esperadosPeloJava(cadastros));
    }

    @Test
    void sqlEquivaleAoJavaNoCatalogoDeExemplo() throws SQLException {
        long empresa = inserirEmpresa("Empresa Demo");
        List<Cadastro> cadastros = CATALOGO_DE_EXEMPLO.stream()
                .map(exemplo -> new Cadastro(exemplo.nome(), null, exemplo.sku(), exemplo.marca()))
                .toList();
        for (Cadastro cadastro : cadastros) {
            inserirProduto(empresa, cadastro);
        }

        aplicarV10();

        assertThat(normalizadosGravados()).hasSize(30).containsExactlyElementsOf(esperadosPeloJava(cadastros));
        assertThat(normalizadosGravados().get(2))
                .isEqualTo(new Normalizados("acucar refinado 1kg", "acucar refinado 1kg demo-mer-003 uniao"));
    }

    @Test
    void colunasNotNull() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        aplicarV10();

        assertThat(contar("""
                SELECT count(*) FROM information_schema.columns
                 WHERE table_name = 'produtos' AND column_name IN ('busca_normalizada', 'nome_normalizado')
                   AND is_nullable = 'NO' AND data_type = 'text'
                """)).isEqualTo(2);
        assertThatThrownBy(() -> executar("INSERT INTO produtos (empresa_id, nome, preco_venda, unidade_id,"
                + " nome_normalizado) VALUES (" + empresa + ", 'Sem busca', 1, " + unidadeUn(empresa) + ", 'x')"))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("busca_normalizada")
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(VIOLACAO_DE_NOT_NULL);
        assertThatThrownBy(() -> executar("INSERT INTO produtos (empresa_id, nome, preco_venda, unidade_id,"
                + " busca_normalizada) VALUES (" + empresa + ", 'Sem nome', 1, " + unidadeUn(empresa) + ", 'x')"))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("nome_normalizado")
                .extracting(erro -> ((SQLException) erro).getSQLState()).isEqualTo(VIOLACAO_DE_NOT_NULL);
    }

    @Test
    void indicesCriados() throws SQLException {
        aplicarV10();

        assertThat(definicaoDoIndice("ix_produto_empresa_ativo_nome"))
                .contains("(empresa_id, ativo, nome_normalizado, id)");
        assertThat(definicaoDoIndice("ix_produto_empresa_criado")).contains("(empresa_id, criado_em DESC, id DESC)");
        assertThat(definicaoDoIndice("ix_produto_empresa_atualizado"))
                .contains("COALESCE(atualizado_em, criado_em) DESC", "id DESC");
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private record ProdutoDeExemplo(String nome, String sku, String marca) {
    }

    /** Campos que entram na busca; {@code null} grava NULL. */
    private record Cadastro(String nome, String nomeCurto, String sku, String marca) {
    }

    private record Normalizados(String nome, String busca) {
    }

    private static List<Normalizados> esperadosPeloJava(List<Cadastro> cadastros) {
        return cadastros.stream()
                .map(cadastro -> new Normalizados(TextoDeBusca.normalizar(cadastro.nome()),
                        TextoDeBusca.textoDoProduto(cadastro.nome(), cadastro.nomeCurto(), cadastro.sku(),
                                cadastro.marca())))
                .toList();
    }

    private static List<Normalizados> normalizadosGravados() throws SQLException {
        List<Normalizados> gravados = new ArrayList<>();
        try (Connection conexao = conectar();
                Statement comando = conexao.createStatement();
                ResultSet resultado = comando.executeQuery(
                        "SELECT nome_normalizado, busca_normalizada FROM produtos ORDER BY id")) {
            while (resultado.next()) {
                gravados.add(new Normalizados(resultado.getString(1), resultado.getString(2)));
            }
        }
        return gravados;
    }

    private static String definicaoDoIndice(String nome) throws SQLException {
        try (Connection conexao = conectar();
                PreparedStatement comando = conexao.prepareStatement(
                        "SELECT indexdef FROM pg_indexes WHERE tablename = 'produtos' AND indexname = ?")) {
            comando.setString(1, nome);
            try (ResultSet resultado = comando.executeQuery()) {
                assertThat(resultado.next()).as("indice %s existe", nome).isTrue();
                return resultado.getString(1);
            }
        }
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

    /** Aplica exatamente ate a V10 (migrations futuras nao interferem no teste). */
    private static void aplicarV10() {
        flyway(VERSAO_V10).migrate();
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

    private static long unidadeUn(long empresaId) throws SQLException {
        return contar("SELECT id FROM unidades_medida WHERE empresa_id = " + empresaId + " AND sigla = 'UN'");
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

    /** Produto no schema da V9 (uuid pelo DEFAULT do banco). */
    private static void inserirProduto(long empresaId, Cadastro cadastro) throws SQLException {
        String sql = """
                INSERT INTO produtos (empresa_id, nome, nome_curto, sku, marca, preco_venda, unidade_id)
                VALUES (?, ?, ?, ?, ?, 10.00, (SELECT id FROM unidades_medida WHERE empresa_id = ? AND sigla = 'UN'))
                """;
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setLong(1, empresaId);
            comando.setString(2, cadastro.nome());
            comando.setString(3, cadastro.nomeCurto());
            comando.setString(4, cadastro.sku());
            comando.setString(5, cadastro.marca());
            comando.setLong(6, empresaId);
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
