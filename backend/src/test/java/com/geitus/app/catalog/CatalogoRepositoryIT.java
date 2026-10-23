package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase.Replace;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.geitus.app.catalog.categoria.Categoria;
import com.geitus.app.catalog.categoria.CategoriaRepository;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.catalog.unidade.UnidadeMedidaRepository;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;

/**
 * Teste de integracao dos repositorios de {@link UnidadeMedida} e
 * {@link Categoria} contra um PostgreSQL real (Testcontainers), com as
 * migrations reais (inclusive a V6). Exercita as queries derivadas e as
 * contagens nativas de uso — o {@code @WebMvcTest}/Mockito nao as executa.
 *
 * <p>Os produtos sao inseridos por SQL nativo (JdbcTemplate): o teste mira as
 * contagens nativas sobre as colunas da V6, independente do mapeamento JPA de
 * {@code Produto}.
 *
 * <p>Requer Docker disponivel no ambiente.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Testcontainers
class CatalogoRepositoryIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configurarDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EmpresaRepository empresaRepository;

    @Autowired
    private UnidadeMedidaRepository unidadeRepository;

    @Autowired
    private CategoriaRepository categoriaRepository;

    // ---------- Helpers ----------

    private Empresa novaEmpresa(String nome) {
        String slug = nome.toLowerCase().replaceAll("[^a-z0-9]", "");
        Empresa empresa = new Empresa(nome);
        empresa.atualizarCadastro(
                nome,
                "1133224455",
                "contato@" + slug + ".test",
                TipoPessoa.FISICA,
                null,
                null,
                null,
                new RepresentanteLegal("Representante " + nome, "11144477735", "11987654321",
                        "rep@" + slug + ".test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        return empresaRepository.saveAndFlush(empresa);
    }

    private UnidadeMedida novaUnidade(Empresa empresa, String sigla) {
        return unidadeRepository.saveAndFlush(new UnidadeMedida(empresa, sigla, "Unidade " + sigla, false));
    }

    private Categoria novaCategoria(Empresa empresa, Categoria pai, String nome) {
        return categoriaRepository.saveAndFlush(new Categoria(empresa, pai, nome));
    }

    private void novoProduto(Empresa empresa, UnidadeMedida unidade, UnidadeMedida unidadeCompra,
            Categoria categoria) {
        // JdbcTemplate (mesma transacao do teste): binda nulos sem o problema de
        // inferencia de tipo dos parametros nulos em query nativa do Hibernate.
        // As colunas da busca (V10) sao NOT NULL e mantidas pela aplicacao; o
        // numero (V11) e o proximo livre da empresa.
        jdbcTemplate.update("""
                INSERT INTO produtos (empresa_id, numero, nome, preco_venda, unidade_id, unidade_compra_id,
                                      fator_conversao, categoria_id, nome_normalizado, busca_normalizada)
                VALUES (?, (SELECT coalesce(max(numero), 0) + 1 FROM produtos WHERE empresa_id = ?), 'Produto',
                        10.00, ?, ?, ?, ?, 'produto', 'produto')
                """,
                empresa.getId(),
                empresa.getId(),
                unidade.getId(),
                unidadeCompra == null ? null : unidadeCompra.getId(),
                unidadeCompra == null ? null : new BigDecimal("12"),
                categoria == null ? null : categoria.getId());
    }

    private static Map<Long, Long> comoMapa(List<Object[]> linhas) {
        Map<Long, Long> mapa = new HashMap<>();
        for (Object[] linha : linhas) {
            mapa.put(((Number) linha[0]).longValue(), ((Number) linha[1]).longValue());
        }
        return mapa;
    }

    // ---------- Unidades: contagem de uso (Review Focus 5) ----------

    @Test
    void contarProdutosQueUsamContaVendaECompra() {
        Empresa empresa = novaEmpresa("Empresa Uso");
        UnidadeMedida un = novaUnidade(empresa, "UN");
        UnidadeMedida cx = novaUnidade(empresa, "CX");
        UnidadeMedida fd = novaUnidade(empresa, "FD");
        UnidadeMedida semUso = novaUnidade(empresa, "PCT");
        novoProduto(empresa, un, null, null);
        novoProduto(empresa, un, cx, null);
        novoProduto(empresa, cx, null, null);
        novoProduto(empresa, un, fd, null);

        assertThat(unidadeRepository.contarProdutosQueUsam(un.getId())).isEqualTo(3);
        assertThat(unidadeRepository.contarProdutosQueUsam(cx.getId())).isEqualTo(2);
        // Usada SO como unidade de compra: ainda conta (bloqueia a exclusao).
        assertThat(unidadeRepository.contarProdutosQueUsam(fd.getId())).isEqualTo(1);
        assertThat(unidadeRepository.contarProdutosQueUsam(semUso.getId())).isZero();
    }

    @Test
    void contarUsoPorUnidadeContaCadaProdutoUmaVezEIsolaEmpresa() {
        Empresa empresa = novaEmpresa("Empresa Uso Lista");
        Empresa outra = novaEmpresa("Outra Uso Lista");
        UnidadeMedida un = novaUnidade(empresa, "UN");
        UnidadeMedida cx = novaUnidade(empresa, "CX");
        UnidadeMedida unDaOutra = novaUnidade(outra, "UN");
        novoProduto(empresa, un, null, null);
        // Mesma unidade como venda e compra: o produto conta uma vez so.
        novoProduto(empresa, cx, cx, null);
        novoProduto(empresa, un, cx, null);
        novoProduto(outra, unDaOutra, null, null);

        Map<Long, Long> uso = comoMapa(unidadeRepository.contarUsoPorUnidade(empresa.getId()));

        assertThat(uso).containsOnlyKeys(un.getId(), cx.getId());
        assertThat(uso.get(un.getId())).isEqualTo(2);
        assertThat(uso.get(cx.getId())).isEqualTo(2);
    }

    // ---------- Categorias: contagens ----------

    @Test
    void contarProdutosPorCategoria() {
        Empresa empresa = novaEmpresa("Empresa Categorias");
        Empresa outra = novaEmpresa("Outra Categorias");
        UnidadeMedida un = novaUnidade(empresa, "UN");
        UnidadeMedida unDaOutra = novaUnidade(outra, "UN");
        Categoria racao = novaCategoria(empresa, null, "Ração");
        Categoria umida = novaCategoria(empresa, racao, "Úmida");
        Categoria vazia = novaCategoria(empresa, null, "Vazia");
        Categoria daOutra = novaCategoria(outra, null, "Ração");
        novoProduto(empresa, un, null, racao);
        novoProduto(empresa, un, null, racao);
        novoProduto(empresa, un, null, umida);
        novoProduto(empresa, un, null, null);
        novoProduto(outra, unDaOutra, null, daOutra);

        Map<Long, Long> porCategoria = comoMapa(categoriaRepository.contarProdutosPorCategoria(empresa.getId()));

        assertThat(porCategoria).containsOnlyKeys(racao.getId(), umida.getId());
        assertThat(porCategoria.get(racao.getId())).isEqualTo(2);
        assertThat(porCategoria.get(umida.getId())).isEqualTo(1);
        assertThat(categoriaRepository.contarProdutos(racao.getId())).isEqualTo(2);
        assertThat(categoriaRepository.contarProdutos(vazia.getId())).isZero();
        assertThat(categoriaRepository.countByPai_Id(racao.getId())).isEqualTo(1);
        assertThat(categoriaRepository.countByPai_Id(umida.getId())).isZero();
    }

    // ---------- Isolamento por empresa (DEC-016) ----------

    @Test
    void buscasIsolamPorEmpresa() {
        Empresa empresaA = novaEmpresa("Empresa Isolada A");
        Empresa empresaB = novaEmpresa("Empresa Isolada B");
        UnidadeMedida unA = novaUnidade(empresaA, "UN");
        UnidadeMedida kgA = novaUnidade(empresaA, "KG");
        novaUnidade(empresaB, "UN");
        Categoria racaoA = novaCategoria(empresaA, null, "Ração");
        novaCategoria(empresaB, null, "Ração");

        assertThat(unidadeRepository.findByUuidAndEmpresa_Id(unA.getUuid(), empresaB.getId())).isEmpty();
        assertThat(unidadeRepository.findByUuidAndEmpresa_Id(unA.getUuid(), empresaA.getId())).isPresent();
        assertThat(unidadeRepository.findByEmpresa_IdOrderBySigla(empresaA.getId()))
                .extracting(UnidadeMedida::getId).containsExactly(kgA.getId(), unA.getId());
        assertThat(unidadeRepository.existsBySiglaAndEmpresa_Id("KG", empresaB.getId())).isFalse();
        assertThat(unidadeRepository.existsBySiglaAndEmpresa_Id("KG", empresaA.getId())).isTrue();
        assertThat(unidadeRepository.existsBySiglaAndEmpresa_IdAndIdNot("KG", empresaA.getId(), kgA.getId()))
                .isFalse();
        assertThat(unidadeRepository.existsBySiglaAndEmpresa_IdAndIdNot("KG", empresaA.getId(), unA.getId()))
                .isTrue();

        assertThat(categoriaRepository.findByUuidAndEmpresa_Id(racaoA.getUuid(), empresaB.getId())).isEmpty();
        assertThat(categoriaRepository.findByUuidAndEmpresa_Id(racaoA.getUuid(), empresaA.getId())).isPresent();
        assertThat(categoriaRepository.findByEmpresa_Id(empresaA.getId()))
                .extracting(Categoria::getId).containsExactly(racaoA.getId());
    }

    @Test
    void filtroDeStatusDasUnidades() {
        Empresa empresa = novaEmpresa("Empresa Status");
        UnidadeMedida un = novaUnidade(empresa, "UN");
        UnidadeMedida cx = novaUnidade(empresa, "CX");
        cx.inativar();
        unidadeRepository.saveAndFlush(cx);

        assertThat(unidadeRepository.findByEmpresa_IdAndAtivoOrderBySigla(empresa.getId(), true))
                .extracting(UnidadeMedida::getId).containsExactly(un.getId());
        assertThat(unidadeRepository.findByEmpresa_IdAndAtivoOrderBySigla(empresa.getId(), false))
                .extracting(UnidadeMedida::getId).containsExactly(cx.getId());
    }

    // ---------- Constraints da V6 vistas pela entidade ----------

    @Test
    void indiceDeIrmaosAceitaMesmoNomeSobOutroPaiERejeitaRepetidoNoMesmoPai() {
        Empresa empresa = novaEmpresa("Empresa Irmaos");
        Categoria mercearia = novaCategoria(empresa, null, "Mercearia");
        Categoria limpeza = novaCategoria(empresa, null, "Limpeza");
        novaCategoria(empresa, mercearia, "Bebidas");
        // Mesmo nome sob outro pai: permitido.
        assertThat(novaCategoria(empresa, limpeza, "bebidas").getId()).isNotNull();

        // Mesmo pai, so muda a caixa: o indice uq_categoria_irmaos rejeita.
        // (Ultimo passo do teste: a violacao aborta a transacao no Postgres.)
        assertThatThrownBy(() -> novaCategoria(empresa, mercearia, "bebidas"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void indiceDeIrmaosRejeitaRaizRepetida() {
        Empresa empresa = novaEmpresa("Empresa Raizes");
        novaCategoria(empresa, null, "Bebidas");

        assertThatThrownBy(() -> novaCategoria(empresa, null, "BEBIDAS"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void entidadesPersistemUuidGeradoNaAplicacaoETimestamps() {
        Empresa empresa = novaEmpresa("Empresa UUID Catalogo");
        UnidadeMedida unidade = new UnidadeMedida(empresa, "UN", "Unidade", false);
        Categoria categoria = new Categoria(empresa, null, "Ração");
        var uuidUnidade = unidade.getUuid();
        var uuidCategoria = categoria.getUuid();
        unidadeRepository.saveAndFlush(unidade);
        categoriaRepository.saveAndFlush(categoria);
        entityManager.clear();

        UnidadeMedida unidadeLida = unidadeRepository.findByUuidAndEmpresa_Id(uuidUnidade, empresa.getId())
                .orElseThrow();
        Categoria categoriaLida = categoriaRepository.findByUuidAndEmpresa_Id(uuidCategoria, empresa.getId())
                .orElseThrow();
        assertThat(unidadeLida.getCriadoEm()).isNotNull();
        assertThat(unidadeLida.getEmpresaId()).isEqualTo(empresa.getId());
        assertThat(categoriaLida.getCriadoEm()).isNotNull();
        assertThat(categoriaLida.getPai()).isNull();
    }
}
