package com.geitus.app.catalog.imagem;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase.Replace;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * As consultas do {@link ImagemDoProdutoRepository} contra um PostgreSQL real
 * (Testcontainers, V15): o resumo sem bytes isolado por empresa (DEC-016), os
 * resumos em lote, os bytes pela versao atual e a remocao. Licao registrada:
 * JPQL so conta como testado quando roda num banco de verdade.
 *
 * <p>Requer Docker.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Testcontainers
class ImagemDoProdutoRepositoryIT {

    private static final AtomicInteger SEQUENCIA = new AtomicInteger();
    private static final LocalDateTime AGORA = LocalDateTime.now().truncatedTo(ChronoUnit.MICROS);

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
    private ImagemDoProdutoRepository repositorio;

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void resumoTrazAsDimensoesDaGrandeEOUuidDoProduto() {
        Loja loja = novaLoja();
        Produto produto = novoProduto(loja);
        ImagemDoProduto imagem = gravar(loja, produto, imagemConferida(TipoDeImagem.JPEG, 1200, 800));

        assertThat(repositorio.resumo(loja.empresa(), produto.id())).contains(new ResumoDaImagem(produto.id(),
                produto.uuid(), imagem.getVersao(), TipoDeImagem.JPEG, 1200, 800, AGORA));
    }

    @Test
    void resumoDeOutraEmpresaNaoAparece() {
        Loja loja = novaLoja();
        Loja outra = novaLoja();
        Produto produto = novoProduto(loja);
        gravar(loja, produto, imagemConferida(TipoDeImagem.WEBP, 800, 600));

        assertThat(repositorio.resumo(outra.empresa(), produto.id())).isEmpty();
        assertThat(repositorio.resumos(outra.empresa(), List.of(produto.id()))).isEmpty();
    }

    @Test
    void resumosSoDosProdutosComImagem() {
        Loja loja = novaLoja();
        Produto comImagem = novoProduto(loja);
        Produto semImagem = novoProduto(loja);
        Produto outroComImagem = novoProduto(loja);
        gravar(loja, comImagem, imagemConferida(TipoDeImagem.WEBP, 800, 600));
        gravar(loja, outroComImagem, imagemConferida(TipoDeImagem.WEBP, 600, 800));

        assertThat(repositorio.resumos(loja.empresa(), List.of(comImagem.id(), semImagem.id(), outroComImagem.id())))
                .extracting(ResumoDaImagem::produtoId)
                .containsExactlyInAnyOrder(comImagem.id(), outroComImagem.id());
    }

    @Test
    void bytesDeCadaVersaoPelaVersaoAtual() {
        Loja loja = novaLoja();
        Produto produto = novoProduto(loja);
        ImagemDoProduto imagem = gravar(loja, produto, imagemConferida(TipoDeImagem.WEBP, 800, 600));

        assertThat(repositorio.grande(produto.uuid(), imagem.getVersao())).hasValueSatisfying(bytes -> {
            assertThat(bytes.bytes()).hasSize(1000);
            assertThat(bytes.tipo()).isEqualTo(TipoDeImagem.WEBP);
        });
        assertThat(repositorio.miniatura(produto.uuid(), imagem.getVersao()))
                .hasValueSatisfying(bytes -> assertThat(bytes.bytes()).hasSize(100));
        assertThat(repositorio.grande(produto.uuid(), UUID.randomUUID())).isEmpty();
        assertThat(repositorio.grande(novoProduto(loja).uuid(), imagem.getVersao())).isEmpty();
    }

    /** Review Focus 3: a troca gera versao nova e a versao antiga deixa de achar os bytes. */
    @Test
    void trocaGeraVersaoNovaEAAntigaSome() {
        Loja loja = novaLoja();
        Produto produto = novoProduto(loja);
        ImagemDoProduto imagem = gravar(loja, produto, imagemConferida(TipoDeImagem.WEBP, 800, 600));
        UUID antiga = imagem.getVersao();

        ImagemDoProduto gravada = repositorio.findById(produto.id()).orElseThrow();
        gravada.substituir(imagemConferida(TipoDeImagem.JPEG, 640, 480), loja.usuario(), AGORA);
        repositorio.saveAndFlush(gravada);
        entityManager.clear();

        assertThat(gravada.getVersao()).isNotEqualTo(antiga);
        assertThat(repositorio.grande(produto.uuid(), antiga)).isEmpty();
        assertThat(repositorio.grande(produto.uuid(), gravada.getVersao()))
                .hasValueSatisfying(bytes -> assertThat(bytes.tipo()).isEqualTo(TipoDeImagem.JPEG));
        assertThat(repositorio.resumo(loja.empresa(), produto.id()))
                .hasValueSatisfying(resumo -> assertThat(resumo.largura()).isEqualTo(640));
    }

    @Test
    void removerApagaSoNaEmpresaDoProduto() {
        Loja loja = novaLoja();
        Loja outra = novaLoja();
        Produto produto = novoProduto(loja);
        gravar(loja, produto, imagemConferida(TipoDeImagem.WEBP, 800, 600));

        assertThat(repositorio.remover(outra.empresa(), produto.id())).isZero();
        assertThat(repositorio.remover(loja.empresa(), produto.id())).isEqualTo(1);
        assertThat(repositorio.remover(loja.empresa(), produto.id())).isZero();
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private record Loja(Long empresa, Long usuario) {
    }

    private record Produto(Long id, UUID uuid) {
    }

    private ImagemDoProduto gravar(Loja loja, Produto produto, ImagemConferida conferida) {
        ImagemDoProduto imagem = repositorio.saveAndFlush(new ImagemDoProduto(loja.empresa(), produto.id(),
                conferida, loja.usuario(), AGORA));
        entityManager.clear();
        return imagem;
    }

    private static ImagemConferida imagemConferida(TipoDeImagem tipo, int largura, int altura) {
        return new ImagemConferida(tipo, new ImagemConferida.Versao(new byte[1000], largura, altura),
                new ImagemConferida.Versao(new byte[100], 200, 150));
    }

    private Loja novaLoja() {
        int sufixo = SEQUENCIA.incrementAndGet();
        Long empresa = jdbcTemplate.queryForObject("""
                INSERT INTO empresa (nome, representante_nome, representante_cpf, representante_telefone,
                                     representante_email, telefone, email, tipo_pessoa, endereco_cep,
                                     endereco_logradouro, endereco_numero, endereco_bairro,
                                     endereco_municipio, endereco_uf)
                VALUES (?, 'Representante', '11144477735', '11987654321', ?, '1133224455', ?, 'FISICA',
                        '01001000', 'Praça da Sé', 'S/N', 'Sé', 'São Paulo', 'SP')
                RETURNING id
                """, Long.class, "Empresa Imagem " + sufixo, "rep" + sufixo + "@imagem.test",
                "contato" + sufixo + "@imagem.test");
        jdbcTemplate.update("INSERT INTO unidades_medida (empresa_id, sigla, descricao, fracionada)"
                + " VALUES (?, 'UN', 'Unidade', false)", empresa);
        Long usuario = jdbcTemplate.queryForObject("INSERT INTO usuario (empresa_id, nome, email, senha_hash, perfil)"
                + " VALUES (?, 'Admin', ?, 'hash', 'ADMIN') RETURNING id", Long.class, empresa,
                "admin" + sufixo + "@imagem.test");
        return new Loja(empresa, usuario);
    }

    private Produto novoProduto(Loja loja) {
        int numero = SEQUENCIA.incrementAndGet();
        return jdbcTemplate.queryForObject("""
                INSERT INTO produtos (empresa_id, numero, nome, preco_venda, unidade_id, busca_normalizada,
                                      nome_normalizado)
                VALUES (?, ?, 'Produto', 20.00, (SELECT id FROM unidades_medida WHERE empresa_id = ?), 'produto',
                        'produto')
                RETURNING id, uuid
                """, (linha, indice) -> new Produto(linha.getLong("id"), linha.getObject("uuid", UUID.class)),
                loja.empresa(), numero, loja.empresa());
    }
}
