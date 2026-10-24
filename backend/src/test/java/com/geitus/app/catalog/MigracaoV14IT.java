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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Teste de migracao da V14 (fornecedores e marcas, Fase B5) contra um
 * PostgreSQL real (Testcontainers), <b>sem Spring</b>.
 *
 * <p>Cada teste parte de um banco limpo no schema da V13, insere produtos com
 * a marca e o fornecedor em texto, aplica a V14 e confere via JDBC a migracao
 * do texto e as constraints novas (docs/modules/fornecedores-e-marcas.md, 7 e
 * 10; DEC-039).
 *
 * <p>Requer Docker disponivel no ambiente.
 */
@Testcontainers
class MigracaoV14IT {

    private static final String VERSAO_ANTERIOR_A_V14 = "13";
    private static final String VERSAO_V14 = "14";
    private static final String VIOLACAO_DE_FK = "23503";
    private static final String VIOLACAO_DE_UNICIDADE = "23505";
    private static final String VIOLACAO_DE_CHECK = "23514";
    private static final String CNPJ_VALIDO = "11222333000181";
    private static final String CPF_VALIDO = "11144477735";

    private static final AtomicLong NUMERO = new AtomicLong();

    /** {@code postgres:16} (Debian/glibc), a mesma imagem do banco de desenvolvimento. */
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16");

    @BeforeEach
    void prepararBancoNoSchemaDaV13() {
        Flyway flywayAteV13 = flyway(VERSAO_ANTERIOR_A_V14);
        flywayAteV13.clean();
        flywayAteV13.migrate();
    }

    // ---------- Migracao das marcas em texto ----------

    /** Review Focus 2: "Golden" e "golden " viram uma marca so, com a grafia do produto de menor id. */
    @Test
    void marcasQueDiferemSoPorMaiusculasEEspacosViramUmaSoNaRaiz() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long primeiro = inserirProduto(empresa, "Ração Adulto", "Golden", null);
        long segundo = inserirProduto(empresa, "Ração Filhote", "golden ", null);
        long outro = inserirProduto(empresa, "Petisco", "Premier", null);
        long vazio = inserirProduto(empresa, "Areia", "   ", null);
        long semMarca = inserirProduto(empresa, "Coleira", null, null);

        aplicarV14();

        assertThat(texto("SELECT count(*)::text FROM marcas WHERE empresa_id = " + empresa)).isEqualTo("2");
        assertThat(texto("SELECT nome || '/' || (parent_id IS NULL) || '/' || ativo FROM marcas WHERE id = "
                + "(SELECT marca_id FROM produtos WHERE id = " + primeiro + ")")).isEqualTo("Golden/true/true");
        assertThat(texto("SELECT (count(DISTINCT marca_id) = 1 AND count(*) = 2)::text FROM produtos WHERE id IN ("
                + primeiro + ", " + segundo + ")")).isEqualTo("true");
        assertThat(texto("SELECT m.nome FROM produtos p JOIN marcas m ON m.id = p.marca_id WHERE p.id = " + outro))
                .isEqualTo("Premier");
        assertThat(texto("SELECT (marca_id IS NULL)::text FROM produtos WHERE id = " + vazio)).isEqualTo("true");
        assertThat(texto("SELECT (marca_id IS NULL)::text FROM produtos WHERE id = " + semMarca)).isEqualTo("true");
    }

    /** A grafia e a do produto de menor id, mesmo minuscula e com espaco: "golden " antes de "Golden". */
    @Test
    void grafiaDaMarcaEDoFornecedorEADoProdutoDeMenorId() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long primeiro = inserirProduto(empresa, "Ração Filhote", "golden ", "distribuidora xavier");
        long segundo = inserirProduto(empresa, "Ração Adulto", "Golden", "Distribuidora Xavier");

        aplicarV14();

        assertThat(texto("SELECT string_agg(nome, ',') FROM marcas WHERE empresa_id = " + empresa))
                .isEqualTo("golden");
        assertThat(texto("SELECT string_agg(razao_social, ',') FROM fornecedores WHERE empresa_id = " + empresa))
                .isEqualTo("distribuidora xavier");
        assertThat(texto("SELECT (count(DISTINCT marca_id) = 1 AND count(DISTINCT fornecedor_ultima_compra_id) = 1"
                + " AND count(*) = 2)::text FROM produtos WHERE id IN (" + primeiro + ", " + segundo + ")"))
                .isEqualTo("true");
    }

    @Test
    void mesmaMarcaEmEmpresasDiferentesViraUmaMarcaPorEmpresa() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long produtoA = inserirProduto(empresaA, "Ração", "Golden", null);
        long produtoB = inserirProduto(empresaB, "Ração", "GOLDEN", null);

        aplicarV14();

        assertThat(texto("SELECT count(*)::text FROM marcas")).isEqualTo("2");
        assertThat(texto("SELECT m.empresa_id || '/' || m.nome FROM produtos p JOIN marcas m ON m.id = p.marca_id"
                + " WHERE p.id = " + produtoA)).isEqualTo(empresaA + "/Golden");
        assertThat(texto("SELECT m.empresa_id || '/' || m.nome FROM produtos p JOIN marcas m ON m.id = p.marca_id"
                + " WHERE p.id = " + produtoB)).isEqualTo(empresaB + "/GOLDEN");
    }

    // ---------- Migracao dos fornecedores em texto ----------

    @Test
    void fornecedorDoTextoViraCadastroNumeradoNaListaEComoUltimaCompra() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long primeiro = inserirProduto(empresa, "Arroz", null, "Distribuidora Xavier");
        long segundo = inserirProduto(empresa, "Feijão", null, "distribuidora xavier");
        long outro = inserirProduto(empresa, "Óleo", null, "Atacado Sul");
        long semFornecedor = inserirProduto(empresa, "Sal", null, null);

        aplicarV14();

        assertThat(texto("SELECT string_agg(numero || ':' || razao_social || ':' || tipo_pessoa || ':'"
                + " || busca_normalizada || ':' || nome_normalizado, ', ' ORDER BY numero)"
                + " FROM fornecedores WHERE empresa_id = " + empresa))
                .isEqualTo("1:Atacado Sul:PJ:atacado sul:atacado sul, "
                        + "2:Distribuidora Xavier:PJ:distribuidora xavier:distribuidora xavier");
        assertThat(fornecedorDaLista(primeiro)).isEqualTo("Distribuidora Xavier/ultima=true");
        assertThat(fornecedorDaLista(segundo)).isEqualTo("Distribuidora Xavier/ultima=true");
        assertThat(fornecedorDaLista(outro)).isEqualTo("Atacado Sul/ultima=true");
        assertThat(texto("SELECT count(*)::text FROM produto_fornecedores WHERE produto_id = " + semFornecedor))
                .isEqualTo("0");
        assertThat(texto("SELECT (fornecedor_ultima_compra_id IS NULL)::text FROM produtos WHERE id = "
                + semFornecedor)).isEqualTo("true");
        assertThat(texto("SELECT ultimo_numero::text FROM numeracoes WHERE empresa_id = " + empresa
                + " AND tipo = 'FORNECEDOR'")).isEqualTo("2");
    }

    /** Numeracao pelo nome normalizado em collation "C": "Ótica" (otica) vem antes de "Padaria". */
    @Test
    void numeracaoDosFornecedoresMigradosIgnoraOAcento() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        inserirProduto(empresa, "Pão", null, "Padaria Central");
        inserirProduto(empresa, "Óculos", null, "Ótica Visão");
        inserirProduto(empresa, "Arroz", null, "atacado norte");

        aplicarV14();

        assertThat(texto("SELECT string_agg(numero || ':' || razao_social, ', ' ORDER BY numero) FROM fornecedores"
                + " WHERE empresa_id = " + empresa))
                .isEqualTo("1:atacado norte, 2:Ótica Visão, 3:Padaria Central");
    }

    @Test
    void mesmoFornecedorEmDuasEmpresasENumeradoEmCadaUma() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long produtoA = inserirProduto(empresaA, "Arroz", null, "Distribuidora Xavier");
        inserirProduto(empresaB, "Feijão", null, "Atacado Sul");
        long produtoB = inserirProduto(empresaB, "Arroz", null, "distribuidora xavier");

        aplicarV14();

        assertThat(texto("SELECT string_agg(numero || ':' || razao_social, ', ' ORDER BY numero) FROM fornecedores"
                + " WHERE empresa_id = " + empresaB)).isEqualTo("1:Atacado Sul, 2:distribuidora xavier");
        assertThat(texto("SELECT numero || ':' || razao_social FROM fornecedores WHERE empresa_id = " + empresaA))
                .isEqualTo("1:Distribuidora Xavier");
        assertThat(texto("SELECT f.empresa_id::text FROM produtos p JOIN fornecedores f"
                + " ON f.id = p.fornecedor_ultima_compra_id WHERE p.id = " + produtoA))
                .isEqualTo(String.valueOf(empresaA));
        assertThat(texto("SELECT f.empresa_id::text FROM produtos p JOIN fornecedores f"
                + " ON f.id = p.fornecedor_ultima_compra_id WHERE p.id = " + produtoB))
                .isEqualTo(String.valueOf(empresaB));
        assertThat(texto("SELECT string_agg(empresa_id || '=' || ultimo_numero, ',' ORDER BY empresa_id)"
                + " FROM numeracoes WHERE tipo = 'FORNECEDOR'")).isEqualTo(empresaA + "=1," + empresaB + "=2");
    }

    @Test
    void colunasDeTextoESuaConstraintSaemDosProdutos() throws SQLException {
        aplicarV14();

        assertThat(colunaExiste("produtos", "marca")).isFalse();
        assertThat(colunaExiste("produtos", "fornecedor")).isFalse();
        assertThat(texto("SELECT count(*)::text FROM pg_constraint WHERE conname = 'ck_produto_fornecedor_valido'"))
                .isEqualTo("0");
    }

    /** Indices das listas: pelo fornecedor e pelo produto; nenhum indice so para o ultimo fornecedor. */
    @Test
    void indicesDasListasDoFornecedorEDoProduto() throws SQLException {
        aplicarV14();

        assertThat(definicaoDoIndice("ix_representante_fornecedor")).contains("(fornecedor_id, ordem)");
        assertThat(definicaoDoIndice("ix_fornecedor_marca_fornecedor")).contains("(fornecedor_id)");
        assertThat(definicaoDoIndice("ix_produto_fornecedor_produto")).contains("(produto_id)");
        assertThat(texto("SELECT count(*)::text FROM pg_indexes WHERE indexname = 'idx_produto_fornecedor_ultima_compra'"))
                .isEqualTo("0");
    }

    // ---------- Constraints do fornecedor ----------

    @Test
    void documentoComOTamanhoDoTipoDePessoa() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        aplicarV14();

        assertThatCode(() -> inserirFornecedor(empresa, "tipo_pessoa, documento", "'PJ', '" + CNPJ_VALIDO + "'"))
                .doesNotThrowAnyException();
        assertThatCode(() -> inserirFornecedor(empresa, "tipo_pessoa, documento", "'PF', '" + CPF_VALIDO + "'"))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> inserirFornecedor(empresa, "tipo_pessoa, documento", "'PJ', '" + CPF_VALIDO + "'"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_fornecedor_documento"));
        assertThatThrownBy(() -> inserirFornecedor(empresa, "tipo_pessoa, documento", "'PF', '22333444000181'"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_fornecedor_documento"));
        assertThatThrownBy(() -> inserirFornecedor(empresa, "tipo_pessoa", "'PX'"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_fornecedor_tipo_pessoa"));
    }

    @Test
    void ufCepEInscricaoEstadualValidas() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        aplicarV14();

        assertThatCode(() -> inserirFornecedor(empresa, "endereco_uf, endereco_cep, inscricao_estadual",
                "'SP', '01001000', '123456789'")).doesNotThrowAnyException();
        assertThatCode(() -> inserirFornecedor(empresa, "inscricao_estadual", "'ISENTO'")).doesNotThrowAnyException();
        assertThatThrownBy(() -> inserirFornecedor(empresa, "endereco_uf", "'XX'"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_fornecedor_uf"));
        assertThatThrownBy(() -> inserirFornecedor(empresa, "endereco_cep", "'0100100'"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_fornecedor_cep"));
        assertThatThrownBy(() -> inserirFornecedor(empresa, "inscricao_estadual", "'12.345'"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_fornecedor_inscricao_estadual"));
        assertThatThrownBy(() -> inserirFornecedor(empresa, "tipo_pessoa, inscricao_estadual", "'PF', '123'"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_fornecedor_inscricao_so_pj"));
        assertThatThrownBy(() -> inserirFornecedor(empresa, "telefone", "'(11) 3322-4455'"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_fornecedor_telefone"));
    }

    @Test
    void textosDoFornecedorAparadosENaoVazios() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        aplicarV14();

        assertThatThrownBy(() -> inserirFornecedorComRazaoSocial(empresa, " Distribuidora"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_fornecedor_razao_social_valida"));
        assertThatThrownBy(() -> inserirFornecedor(empresa, "nome_fantasia", "''"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_fornecedor_textos_aparados"));
        assertThatThrownBy(() -> inserirFornecedor(empresa, "email", "'contato@x.test '"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_fornecedor_textos_aparados"));
    }

    @Test
    void documentoUnicoPorEmpresaSoQuandoInformado() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        aplicarV14();
        inserirFornecedor(empresaA, "documento", "'" + CNPJ_VALIDO + "'");

        assertThatThrownBy(() -> inserirFornecedor(empresaA, "documento", "'" + CNPJ_VALIDO + "'"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_UNICIDADE, "uq_fornecedor_empresa_documento"));
        assertThatCode(() -> inserirFornecedor(empresaB, "documento", "'" + CNPJ_VALIDO + "'"))
                .doesNotThrowAnyException();
        assertThatCode(() -> {
            inserirFornecedor(empresaA, "observacoes", "'sem documento 1'");
            inserirFornecedor(empresaA, "observacoes", "'sem documento 2'");
        }).doesNotThrowAnyException();
    }

    // ---------- Constraints das marcas ----------

    @Test
    void nomeDeMarcaRepetidoEntreIrmaosEVioladoSemDiferenciarMaiusculas() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        aplicarV14();
        long boehringer = inserirMarca(empresa, null, "Boehringer");
        inserirMarca(empresa, boehringer, "Nexgard");

        assertThatThrownBy(() -> inserirMarca(empresa, boehringer, "NEXGARD"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_UNICIDADE, "uq_marca_irmaos"));
        assertThatThrownBy(() -> inserirMarca(empresa, null, "boehringer"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_UNICIDADE, "uq_marca_irmaos"));
        assertThatCode(() -> inserirMarca(empresa, null, "Nexgard")).doesNotThrowAnyException();
        assertThatThrownBy(() -> inserirMarca(empresa, null, " Golden"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_marca_nome_valido"));
    }

    @Test
    void paiDaMarcaDeOutraEmpresaEVioladoPelaFk() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        aplicarV14();
        long paiDeB = inserirMarca(empresaB, null, "Boehringer");

        assertThatThrownBy(() -> inserirMarca(empresaA, paiDeB, "Nexgard"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_marca_pai"));
    }

    // ---------- Constraints dos representantes ----------

    @Test
    void representanteComNomeAparadoTelefoneSoDigitosEOrdemNaoNegativa() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        aplicarV14();
        long fornecedor = inserirFornecedor(empresa, "observacoes", "'representantes'");

        assertThatCode(() -> inserirRepresentante(empresa, fornecedor, "'Ana'", "'11987654321'", "'ana@x.test'", 0))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> inserirRepresentante(empresa, fornecedor, "' Ana'", "NULL", "NULL", 1))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_representante_nome_valido"));
        assertThatThrownBy(() -> inserirRepresentante(empresa, fornecedor, "''", "NULL", "NULL", 1))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_representante_nome_valido"));
        assertThatThrownBy(() -> inserirRepresentante(empresa, fornecedor, "'Ana'", "'(11) 9876-5432'", "NULL", 1))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_representante_telefone"));
        assertThatThrownBy(() -> inserirRepresentante(empresa, fornecedor, "'Ana'", "NULL", "''", 1))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_representante_email"));
        assertThatThrownBy(() -> inserirRepresentante(empresa, fornecedor, "'Ana'", "NULL", "NULL", -1))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_representante_ordem"));
    }

    // ---------- Fornecedor da ultima compra ----------

    @Test
    void ultimoFornecedorForaDaListaEVioladoPelaFk() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", null, null);
        aplicarV14();
        long fornecedor = inserirFornecedor(empresa, "observacoes", "'fora da lista'");

        assertThatThrownBy(() -> executar("UPDATE produtos SET fornecedor_ultima_compra_id = " + fornecedor
                + " WHERE id = " + produto))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_produto_fornecedor_ultima_compra"));

        ligar(empresa, produto, fornecedor);
        assertThatCode(() -> executar("UPDATE produtos SET fornecedor_ultima_compra_id = " + fornecedor
                + " WHERE id = " + produto)).doesNotThrowAnyException();
    }

    /** A ligacao que e a da ultima compra nao sai sem antes limpar o campo do produto (Review Focus 1). */
    @Test
    void ligacaoDaUltimaCompraNaoEApagadaSemLimparOCampo() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", null, "Distribuidora Xavier");
        aplicarV14();

        assertThatThrownBy(() -> executar("DELETE FROM produto_fornecedores WHERE produto_id = " + produto))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_produto_fornecedor_ultima_compra"));

        executar("UPDATE produtos SET fornecedor_ultima_compra_id = NULL WHERE id = " + produto);
        assertThatCode(() -> executar("DELETE FROM produto_fornecedores WHERE produto_id = " + produto))
                .doesNotThrowAnyException();
    }

    @Test
    void produtoComUltimoFornecedorEExcluidoComAsLigacoes() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", null, "Distribuidora Xavier");
        aplicarV14();

        assertThatCode(() -> executar("DELETE FROM produtos WHERE id = " + produto)).doesNotThrowAnyException();

        assertThat(texto("SELECT count(*)::text FROM produto_fornecedores WHERE produto_id = " + produto))
                .isEqualTo("0");
        assertThat(texto("SELECT count(*)::text FROM fornecedores WHERE empresa_id = " + empresa)).isEqualTo("1");
    }

    @Test
    void fornecedorLigadoAProdutoNaoEExcluido() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        inserirProduto(empresa, "Arroz", null, "Distribuidora Xavier");
        aplicarV14();

        assertThatThrownBy(() -> executar("DELETE FROM fornecedores WHERE empresa_id = " + empresa))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_produto_fornecedor_fornecedor"));
    }

    // ---------- Fornecedor no movimento ----------

    @Test
    void fornecedorNoMovimentoSoNaEntradaPorCompraManual() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        long produto = inserirProduto(empresa, "Arroz", null, null);
        long usuario = inserirUsuario(empresa);
        aplicarV14();
        long fornecedor = inserirFornecedor(empresa, "observacoes", "'movimento'");

        assertThatCode(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "COMPRA", "5", fornecedor))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "DEVOLUCAO_CLIENTE", "5",
                fornecedor))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_fornecedor_so_na_compra"));
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "SAIDA", "PERDA_AVARIA", "-5",
                fornecedor))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_fornecedor_so_na_compra"));
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "ENTRADA", "ESTOQUE_INICIAL", "CADASTRO",
                "5", fornecedor))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_fornecedor_so_na_compra"));
        assertThatThrownBy(() -> inserirMovimento(empresa, produto, usuario, "SAIDA", "VENDA", "VENDA", "-5",
                fornecedor))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_movimento_estoque_fornecedor_so_na_compra"));
        assertThatThrownBy(() -> executar("DELETE FROM fornecedores WHERE id = " + fornecedor))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_movimento_estoque_fornecedor"));
    }

    // ---------- Isolamento por empresa ----------

    @Test
    void ligacoesComFornecedorOuMarcaDeOutraEmpresaSaoVioladasPelaFk() throws SQLException {
        long empresaA = inserirEmpresa("Empresa A");
        long empresaB = inserirEmpresa("Empresa B");
        long produtoA = inserirProduto(empresaA, "Arroz", null, null);
        long usuarioA = inserirUsuario(empresaA);
        aplicarV14();
        long fornecedorA = inserirFornecedor(empresaA, "observacoes", "'A'");
        long fornecedorB = inserirFornecedor(empresaB, "observacoes", "'B'");
        long marcaB = inserirMarca(empresaB, null, "Golden");

        assertThatThrownBy(() -> ligar(empresaA, produtoA, fornecedorB))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_produto_fornecedor_fornecedor"));
        assertThatThrownBy(() -> executar("INSERT INTO fornecedor_marcas (empresa_id, fornecedor_id, marca_id)"
                + " VALUES (" + empresaA + ", " + fornecedorA + ", " + marcaB + ")"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_fornecedor_marca_marca"));
        assertThatThrownBy(() -> executar("UPDATE produtos SET marca_id = " + marcaB + " WHERE id = " + produtoA))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_produto_marca"));
        assertThatThrownBy(() -> executar("INSERT INTO fornecedor_representantes (empresa_id, fornecedor_id, nome,"
                + " ordem) VALUES (" + empresaA + ", " + fornecedorB + ", 'Ana', 0)"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_representante_fornecedor"));
        assertThatThrownBy(() -> inserirMovimento(empresaA, produtoA, usuarioA, "ENTRADA", "COMPRA", "5",
                fornecedorB))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_movimento_estoque_fornecedor"));
    }

    @Test
    void representantesEMarcasSaemJuntoComOFornecedor() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        aplicarV14();
        long fornecedor = inserirFornecedor(empresa, "observacoes", "'com listas'");
        long marca = inserirMarca(empresa, null, "Golden");
        executar("INSERT INTO fornecedor_representantes (empresa_id, fornecedor_id, nome, telefone, ordem) VALUES ("
                + empresa + ", " + fornecedor + ", 'Ana', '11987654321', 0)");
        executar("INSERT INTO fornecedor_marcas (empresa_id, fornecedor_id, marca_id) VALUES (" + empresa + ", "
                + fornecedor + ", " + marca + ")");

        assertThatThrownBy(() -> executar("DELETE FROM marcas WHERE id = " + marca))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_FK, "fk_fornecedor_marca_marca"));
        executar("DELETE FROM fornecedores WHERE id = " + fornecedor);

        assertThat(texto("SELECT count(*)::text FROM fornecedor_representantes")).isEqualTo("0");
        assertThat(texto("SELECT count(*)::text FROM fornecedor_marcas")).isEqualTo("0");
    }

    // ---------- Numeracao ----------

    @Test
    void numeracoesAceitamFornecedor() throws SQLException {
        long empresa = inserirEmpresa("Empresa A");
        aplicarV14();

        assertThatCode(() -> executar("INSERT INTO numeracoes (empresa_id, tipo, ultimo_numero) VALUES (" + empresa
                + ", 'FORNECEDOR', 0)")).doesNotThrowAnyException();
        assertThatThrownBy(() -> executar("INSERT INTO numeracoes (empresa_id, tipo, ultimo_numero) VALUES ("
                + empresa + ", 'VENDA', 0)"))
                .satisfies(erro -> violou(erro, VIOLACAO_DE_CHECK, "ck_numeracao_tipo"));
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private static void violou(Throwable erro, String sqlState, String trecho) {
        assertThat(erro).isInstanceOf(SQLException.class).hasMessageContaining(trecho);
        assertThat(((SQLException) erro).getSQLState()).isEqualTo(sqlState);
    }

    /** "razao social/ultima=true|false" do unico fornecedor da lista do produto. */
    private static String fornecedorDaLista(long produtoId) throws SQLException {
        return texto("SELECT f.razao_social || '/ultima=' || (p.fornecedor_ultima_compra_id = f.id)"
                + " FROM produto_fornecedores pf"
                + " JOIN fornecedores f ON f.empresa_id = pf.empresa_id AND f.id = pf.fornecedor_id"
                + " JOIN produtos p ON p.empresa_id = pf.empresa_id AND p.id = pf.produto_id"
                + " WHERE pf.produto_id = " + produtoId);
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

    /** Aplica exatamente ate a V14 (migrations futuras nao interferem no teste). */
    private static void aplicarV14() {
        flyway(VERSAO_V14).migrate();
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

    /** Produto no schema da V13, em UN, com a marca e o fornecedor em texto ({@code null} = sem). */
    private static long inserirProduto(long empresaId, String nome, String marca, String fornecedor)
            throws SQLException {
        String sql = """
                INSERT INTO produtos (empresa_id, numero, nome, preco_venda, unidade_id, busca_normalizada,
                                      nome_normalizado, marca, fornecedor)
                VALUES (?, ?, ?, 20.00, (SELECT id FROM unidades_medida WHERE empresa_id = ? AND sigla = 'UN'),
                        lower(?), lower(?), ?, ?)
                RETURNING id
                """;
        try (Connection conexao = conectar(); PreparedStatement comando = conexao.prepareStatement(sql)) {
            comando.setLong(1, empresaId);
            comando.setLong(2, NUMERO.incrementAndGet());
            comando.setString(3, nome);
            comando.setLong(4, empresaId);
            comando.setString(5, nome);
            comando.setString(6, nome);
            comando.setString(7, marca);
            comando.setString(8, fornecedor);
            try (ResultSet resultado = comando.executeQuery()) {
                resultado.next();
                return resultado.getLong(1);
            }
        }
    }

    private static long inserirUsuario(long empresaId) throws SQLException {
        return idRetornado("INSERT INTO usuario (empresa_id, nome, email, senha_hash, perfil) VALUES (" + empresaId
                + ", 'Admin', 'admin" + empresaId + "@v14.test', 'hash', 'ADMIN') RETURNING id");
    }

    /** Fornecedor no schema da V14 com as colunas extras informadas (SQL literal), numerado na sequencia. */
    private static long inserirFornecedor(long empresaId, String colunas, String valores) throws SQLException {
        return idRetornado("INSERT INTO fornecedores (empresa_id, numero, razao_social, busca_normalizada,"
                + " nome_normalizado, " + colunas + ") VALUES (" + empresaId + ", " + NUMERO.incrementAndGet()
                + ", 'Fornecedor', 'fornecedor', 'fornecedor', " + valores + ") RETURNING id");
    }

    private static void inserirFornecedorComRazaoSocial(long empresaId, String razaoSocial) throws SQLException {
        executar("INSERT INTO fornecedores (empresa_id, numero, razao_social, busca_normalizada, nome_normalizado)"
                + " VALUES (" + empresaId + ", " + NUMERO.incrementAndGet() + ", '" + razaoSocial
                + "', 'x', 'x')");
    }

    private static long inserirMarca(long empresaId, Long paiId, String nome) throws SQLException {
        return idRetornado("INSERT INTO marcas (empresa_id, parent_id, nome) VALUES (" + empresaId + ", "
                + (paiId == null ? "NULL" : paiId) + ", '" + nome + "') RETURNING id");
    }

    private static void inserirRepresentante(long empresaId, long fornecedorId, String nome, String telefone,
            String email, int ordem) throws SQLException {
        executar("INSERT INTO fornecedor_representantes (empresa_id, fornecedor_id, nome, telefone, email, ordem)"
                + " VALUES (" + empresaId + ", " + fornecedorId + ", " + nome + ", " + telefone + ", " + email + ", "
                + ordem + ")");
    }

    private static void ligar(long empresaId, long produtoId, long fornecedorId) throws SQLException {
        executar("INSERT INTO produto_fornecedores (empresa_id, produto_id, fornecedor_id) VALUES (" + empresaId
                + ", " + produtoId + ", " + fornecedorId + ")");
    }

    /**
     * Movimento manual com a variacao informada (a saida parte do saldo que ela
     * zera), em unidades e com o fornecedor; a compra leva o custo que a V13 exige.
     */
    private static void inserirMovimento(long empresaId, long produtoId, long usuarioId, String tipo, String motivo,
            String quantidade, long fornecedorId) throws SQLException {
        inserirMovimento(empresaId, produtoId, usuarioId, tipo, motivo, "AJUSTE_MANUAL", quantidade, fornecedorId);
    }

    /** Como o movimento manual, com a origem informada (CADASTRO e VENDA). */
    private static void inserirMovimento(long empresaId, long produtoId, long usuarioId, String tipo, String motivo,
            String origem, String quantidade, long fornecedorId) throws SQLException {
        String anterior = "greatest(0, -(" + quantidade + "))";
        String custo = "COMPRA".equals(motivo) ? "10.00, 10.0000" : "NULL, NULL";
        executar("INSERT INTO movimentos_estoque (empresa_id, produto_id, tipo, motivo, origem, quantidade,"
                + " saldo_anterior, saldo_novo, usuario_id, custo_informado, custo_unitario, fornecedor_id) VALUES ("
                + empresaId + ", " + produtoId + ", '" + tipo + "', '" + motivo + "', '" + origem + "', " + quantidade
                + ", " + anterior + ", " + anterior + " + (" + quantidade + "), " + usuarioId + ", " + custo + ", "
                + fornecedorId + ")");
    }

    private static String definicaoDoIndice(String nome) throws SQLException {
        return texto("SELECT indexdef FROM pg_indexes WHERE indexname = '" + nome + "'");
    }

    private static boolean colunaExiste(String tabela, String coluna) throws SQLException {
        return Boolean.parseBoolean(texto("SELECT (count(*) > 0)::text FROM information_schema.columns"
                + " WHERE table_name = '" + tabela + "' AND column_name = '" + coluna + "'"));
    }
}
