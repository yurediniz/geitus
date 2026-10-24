package com.geitus.app.catalog.imagem;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.emptyString;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.util.UriComponents;
import org.springframework.web.util.UriComponentsBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.geitus.app.catalog.ProdutoService;
import com.geitus.app.catalog.dto.ProdutoRequest;
import com.geitus.app.catalog.unidade.UnidadeMedidaService;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.company.Endereco;
import com.geitus.app.company.RepresentanteLegal;
import com.geitus.app.company.TipoPessoa;
import com.geitus.app.iam.JwtService;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Envio, remocao e leitura assinada da imagem do produto de ponta a ponta
 * (docs/modules/produtos-imagem.md, 4 e 8): filtro JWT, {@code SecurityConfig},
 * controllers, handler de erros e um PostgreSQL real (Testcontainers, V15).
 *
 * <p>Servidor em porta aleatoria: o limite do multipart (413) so existe no
 * Tomcat de verdade, o MockMvc nao o aplica; os demais casos usam o MockMvc.
 * Sem {@code @Transactional}: cada chamada confirma a propria transacao.
 * Cada teste usa empresas novas. Requer Docker.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Testcontainers
class ImagemDoProdutoIT {

    private static final AtomicInteger SEQUENCIA = new AtomicInteger();
    private static final byte[] GRANDE = ImagensDeTeste.comTamanho(ImagensDeTeste.webpVp8(1200, 900), 5_000);
    private static final byte[] MINIATURA = ImagensDeTeste.comTamanho(ImagensDeTeste.webpVp8(200, 150), 500);
    private static final String FORMATO_NAO_ACEITO = "Formato de imagem não aceito. Use WebP ou JPEG.";

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
    private MockMvc mockMvc;

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private AssinaturaDeImagem assinatura;

    @Autowired
    private ProdutoService produtoService;

    @Autowired
    private UnidadeMedidaService unidadeService;

    @Autowired
    private EmpresaRepository empresaRepository;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // ---------- Envio e leitura publica ----------

    @Test
    void envioValidoRespondeComAsUrlsAssinadas() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);

        enviar(loja.admin(), produto, GRANDE, MINIATURA)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.grandeUrl").value(startsWith("/api/imagens/produtos/" + produto + "/")))
                .andExpect(jsonPath("$.grandeUrl").value(containsString("/grande?expira=")))
                .andExpect(jsonPath("$.miniaturaUrl").value(containsString("/miniatura?expira=")))
                .andExpect(jsonPath("$.miniaturaUrl").value(containsString("&assinatura=")))
                .andExpect(jsonPath("$.largura").value(1200))
                .andExpect(jsonPath("$.altura").value(900))
                .andExpect(jsonPath("$.atualizadaEm").isNotEmpty());
    }

    /** A rota publica serve os bytes sem JWT, com o tipo gravado, nosniff e cache longo. */
    @Test
    void leituraPublicaServeOsBytesSemJwt() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        JsonNode imagem = enviarComSucesso(loja, produto, GRANDE, MINIATURA);

        mockMvc.perform(get(imagem.get("grandeUrl").asText()))
                .andExpect(status().isOk())
                .andExpect(content().bytes(GRANDE))
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/webp"))
                .andExpect(header().stringValues("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "inline"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL,
                        matchesPattern("private, max-age=\\d+, immutable")))
                .andExpect(header().string(HttpHeaders.ETAG, containsString("-grande\"")))
                .andExpect(header().doesNotExist(HttpHeaders.PRAGMA))
                .andExpect(header().string("Content-Security-Policy", "default-src 'none'; sandbox"))
                .andExpect(header().string("Cross-Origin-Resource-Policy", "same-site"));
        mockMvc.perform(get(imagem.get("miniaturaUrl").asText()))
                .andExpect(status().isOk())
                .andExpect(content().bytes(MINIATURA));
    }

    @Test
    void jpegEServidoComOTipoJpeg() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        byte[] grande = ImagensDeTeste.jpeg(ImagensDeTeste.SOF0, 800, 600);
        JsonNode imagem = enviarComSucesso(loja, produto, grande, ImagensDeTeste.jpeg(ImagensDeTeste.SOF2, 200, 150));

        mockMvc.perform(get(imagem.get("grandeUrl").asText()))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/jpeg"))
                .andExpect(content().bytes(grande));
    }

    /** Spec 4.1: o produto inativo tambem pode ter a imagem trocada. */
    @Test
    void produtoInativoAceitaAImagem() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        produtoService.inativarParaUsuario(loja.admin(), produto);

        enviar(loja.admin(), produto, GRANDE, MINIATURA).andExpect(status().isOk());
    }

    // ---------- Conferencias (tabela da spec 4.1) ----------

    @Test
    void faltaUmaDasPartes() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);

        mockMvc.perform(multipart(HttpMethod.PUT, "/api/produtos/{id}/imagem", produto)
                        .file(parte("grande", GRANDE))
                        .header(HttpHeaders.AUTHORIZATION, token(loja.admin())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Envie a imagem grande e a miniatura."));
        enviar(loja.admin(), produto, GRANDE, new byte[0])
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Envie a imagem grande e a miniatura."));
    }

    /** Pedido que nao e multipart (por exemplo JSON) e tratado como partes ausentes, nunca 500. */
    @Test
    void pedidoSemMultipartEPartesAusentes() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);

        mockMvc.perform(put("/api/produtos/{id}/imagem", produto)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}")
                        .header(HttpHeaders.AUTHORIZATION, token(loja.admin())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Envie a imagem grande e a miniatura."));
    }

    @Test
    void pngEOutrosFormatosSaoRecusados() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);

        enviar(loja.admin(), produto, ImagensDeTeste.png(), MINIATURA)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value(FORMATO_NAO_ACEITO));
    }

    /** Review Focus 1: SVG com extensao .jpg e Content-Type image/jpeg; o tipo real decide, e nada e gravado. */
    @Test
    void svgDisfarcadoDeJpgERecusadoENuncaServido() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);

        mockMvc.perform(multipart(HttpMethod.PUT, "/api/produtos/{id}/imagem", produto)
                        .file(new MockMultipartFile("grande", "foto.jpg", "image/jpeg", ImagensDeTeste.svg()))
                        .file(new MockMultipartFile("miniatura", "foto.jpg", "image/jpeg", ImagensDeTeste.svg()))
                        .header(HttpHeaders.AUTHORIZATION, token(loja.admin())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value(FORMATO_NAO_ACEITO));
        assertThat(imagensGravadas(produto)).isZero();
    }

    @Test
    void tiposDiferentesNasDuasPartes() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);

        enviar(loja.admin(), produto, GRANDE, ImagensDeTeste.jpeg(ImagensDeTeste.SOF0, 200, 150))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value(FORMATO_NAO_ACEITO));
    }

    @Test
    void grandeAcimaDe400Kb() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);

        enviar(loja.admin(), produto, ImagensDeTeste.comTamanho(GRANDE, 409_601), MINIATURA)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("A imagem grande deve ter no máximo 400 KB."));
    }

    @Test
    void miniaturaAcimaDe40Kb() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);

        enviar(loja.admin(), produto, GRANDE, ImagensDeTeste.comTamanho(MINIATURA, 40_961))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("A miniatura deve ter no máximo 40 KB."));
    }

    /** Review Focus 1: RIFF/WEBP corretos, mas um bloco desconhecido: 400, nunca 500. */
    @Test
    void cabecalhoIlegivel() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);

        enviar(loja.admin(), produto, ImagensDeTeste.webpComBloco("ABCD"), MINIATURA)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Não foi possível ler as dimensões da imagem."));
    }

    @Test
    void maiorLadoAcimaDoLimite() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);

        enviar(loja.admin(), produto, ImagensDeTeste.webpVp8(1201, 900), MINIATURA)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("A imagem grande deve ter no máximo 1200 px no maior lado."));
        enviar(loja.admin(), produto, GRANDE, ImagensDeTeste.webpVp8(150, 201))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("A miniatura deve ter no máximo 200 px no maior lado."));
    }

    /** Spec 4.1: acima do limite do multipart (512 KB por parte) o Tomcat recusa, e a resposta e 413. */
    @Test
    void parteAcimaDoLimiteDoServidorResponde413() {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        MultiValueMap<String, Object> partes = new LinkedMultiValueMap<>();
        partes.add("grande", recurso("grande.webp", ImagensDeTeste.comTamanho(GRANDE, 600 * 1024)));
        partes.add("miniatura", recurso("miniatura.webp", MINIATURA));

        ResponseEntity<String> resposta = enviarPeloServidor(loja, produto, partes);

        assertThat(resposta.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(resposta.getBody()).contains("A imagem enviada é grande demais.");
        assertThat(imagensGravadas(produto)).isZero();
    }

    /**
     * Spec 4.1: cada parte cabe no limite por parte (512 KB), mas a soma passa
     * de 1 MB por requisicao: 413. Partes de 524 287 bytes (1 abaixo do limite
     * por parte) mais os cabecalhos do multipart passam de 1 048 576 bytes.
     */
    @Test
    void requisicaoAcimaDoLimiteTotalResponde413() {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        int quaseOLimiteDaParte = 512 * 1024 - 1;
        MultiValueMap<String, Object> partes = new LinkedMultiValueMap<>();
        partes.add("grande", recurso("grande.webp", ImagensDeTeste.comTamanho(GRANDE, quaseOLimiteDaParte)));
        partes.add("miniatura", recurso("miniatura.webp", ImagensDeTeste.comTamanho(MINIATURA, quaseOLimiteDaParte)));

        ResponseEntity<String> resposta = enviarPeloServidor(loja, produto, partes);

        assertThat(resposta.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(resposta.getBody()).contains("A imagem enviada é grande demais.");
        assertThat(imagensGravadas(produto)).isZero();
    }

    // ---------- Perfis e isolamento ----------

    @Test
    void operadorNaoEnviaNemRemove() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);

        enviar(loja.operador(), produto, GRANDE, MINIATURA).andExpect(status().isForbidden());
        enviarComSucesso(loja, produto, GRANDE, MINIATURA);
        mockMvc.perform(delete("/api/produtos/{id}/imagem", produto)
                        .header(HttpHeaders.AUTHORIZATION, token(loja.operador())))
                .andExpect(status().isForbidden());
        assertThat(imagensGravadas(produto)).isEqualTo(1);
    }

    @Test
    void semJwtNaoEnvia() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);

        mockMvc.perform(multipart(HttpMethod.PUT, "/api/produtos/{id}/imagem", produto)
                        .file(parte("grande", GRANDE)).file(parte("miniatura", MINIATURA)))
                .andExpect(status().isUnauthorized());
    }

    /** DEC-016: produto de outra empresa responde 404 no envio e na remocao, e nada muda. */
    @Test
    void produtoDeOutraEmpresaResponde404() throws Exception {
        Loja loja = novaLoja();
        Loja outra = novaLoja();
        UUID daOutra = novoProduto(outra);
        enviarComSucesso(outra, daOutra, GRANDE, MINIATURA);

        enviar(loja.admin(), daOutra, GRANDE, MINIATURA)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Produto não encontrado."));
        mockMvc.perform(delete("/api/produtos/{id}/imagem", daOutra)
                        .header(HttpHeaders.AUTHORIZATION, token(loja.admin())))
                .andExpect(status().isNotFound());
        assertThat(imagensGravadas(daOutra)).isEqualTo(1);
    }

    // ---------- Troca e remocao ----------

    /** Review Focus 3: a troca gera uma versao nova; a URL antiga passa a dar 404. */
    @Test
    void trocaGeraVersaoNovaEAUrlAntigaDa404() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        JsonNode primeira = enviarComSucesso(loja, produto, GRANDE, MINIATURA);
        byte[] outraGrande = ImagensDeTeste.webpVp8l(640, 480);

        JsonNode segunda = enviarComSucesso(loja, produto, outraGrande, ImagensDeTeste.webpVp8l(200, 150));

        assertThat(versao(segunda.get("grandeUrl").asText())).isNotEqualTo(versao(primeira.get("grandeUrl").asText()));
        assertThat(segunda.get("largura").asInt()).isEqualTo(640);
        mockMvc.perform(get(primeira.get("grandeUrl").asText()))
                .andExpect(status().isNotFound())
                .andExpect(content().string(emptyString()));
        mockMvc.perform(get(segunda.get("grandeUrl").asText()))
                .andExpect(status().isOk())
                .andExpect(content().bytes(outraGrande));
        assertThat(imagensGravadas(produto)).isEqualTo(1);
    }

    @Test
    void removerResponde204EDeNovo404() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        JsonNode imagem = enviarComSucesso(loja, produto, GRANDE, MINIATURA);

        mockMvc.perform(delete("/api/produtos/{id}/imagem", produto)
                        .header(HttpHeaders.AUTHORIZATION, token(loja.admin())))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/produtos/{id}/imagem", produto)
                        .header(HttpHeaders.AUTHORIZATION, token(loja.admin())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.mensagem").value("Imagem não encontrada."));
        mockMvc.perform(get(imagem.get("grandeUrl").asText())).andExpect(status().isNotFound());
    }

    @Test
    void excluirOProdutoApagaAImagem() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        JsonNode imagem = enviarComSucesso(loja, produto, GRANDE, MINIATURA);

        Long idInterno = jdbcTemplate.queryForObject("SELECT id FROM produtos WHERE uuid = ?", Long.class, produto);
        assertThat(imagensDoIdInterno(idInterno)).isEqualTo(1);

        produtoService.excluirParaUsuario(loja.admin(), produto);

        assertThat(imagensDoIdInterno(idInterno)).isZero();
        mockMvc.perform(get(imagem.get("grandeUrl").asText())).andExpect(status().isNotFound());
    }

    // ---------- No produto (spec 4.3) ----------

    /** O detalhe, a listagem e as respostas de gravacao trazem a imagem (nula sem imagem), tambem ao OPERADOR. */
    @Test
    void produtoTrazAImagemNoDetalheNaListagemENaGravacao() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        mockMvc.perform(get("/api/produtos/{id}", produto).header(HttpHeaders.AUTHORIZATION, token(loja.admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imagem").value(nullValue()));

        JsonNode enviada = enviarComSucesso(loja, produto, GRANDE, MINIATURA);

        mockMvc.perform(get("/api/produtos/{id}", produto)
                        .header(HttpHeaders.AUTHORIZATION, token(loja.operador())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imagem.miniaturaUrl").value(enviada.get("miniaturaUrl").asText()))
                .andExpect(jsonPath("$.imagem.grandeUrl").value(enviada.get("grandeUrl").asText()))
                .andExpect(jsonPath("$.imagem.largura").value(1200))
                .andExpect(jsonPath("$.imagem.altura").value(900))
                .andExpect(jsonPath("$.imagem.atualizadaEm").isNotEmpty());
        mockMvc.perform(get("/api/produtos").header(HttpHeaders.AUTHORIZATION, token(loja.operador())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itens[0].imagem.miniaturaUrl").value(enviada.get("miniaturaUrl").asText()));
        mockMvc.perform(patch("/api/produtos/{id}/inativar", produto)
                        .header(HttpHeaders.AUTHORIZATION, token(loja.admin())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imagem.grandeUrl").value(enviada.get("grandeUrl").asText()));

        mockMvc.perform(delete("/api/produtos/{id}/imagem", produto)
                        .header(HttpHeaders.AUTHORIZATION, token(loja.admin())))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/produtos/{id}", produto).header(HttpHeaders.AUTHORIZATION, token(loja.admin())))
                .andExpect(jsonPath("$.imagem").value(nullValue()));
    }

    // ---------- Leitura publica: assinatura ----------

    /** Review Focus 2: a URL de um produto com a assinatura de outro (mesmo de outra empresa) da 403. */
    @Test
    void assinaturaDeOutroProdutoDa403() throws Exception {
        Loja loja = novaLoja();
        Loja outra = novaLoja();
        UUID produto = novoProduto(loja);
        UUID daOutra = novoProduto(outra);
        UriComponents nossa = partes(enviarComSucesso(loja, produto, GRANDE, MINIATURA).get("grandeUrl").asText());
        UriComponents alheia = partes(enviarComSucesso(outra, daOutra, GRANDE, MINIATURA).get("grandeUrl")
                .asText());

        mockMvc.perform(get(nossa.getPath() + "?" + alheia.getQuery()))
                .andExpect(status().isForbidden())
                .andExpect(content().string(emptyString()));
        mockMvc.perform(get(alheia.getPath().replace(daOutra.toString(), produto.toString()) + "?"
                        + alheia.getQuery()))
                .andExpect(status().isForbidden());
    }

    /** Review Focus 2: trocar miniatura por grande na URL invalida a assinatura. */
    @Test
    void tamanhoTrocadoNaUrlDa403() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        String miniaturaUrl = enviarComSucesso(loja, produto, GRANDE, MINIATURA).get("miniaturaUrl").asText();

        mockMvc.perform(get(miniaturaUrl.replace("/miniatura?", "/grande?")))
                .andExpect(status().isForbidden())
                .andExpect(content().string(emptyString()));
    }

    @Test
    void assinaturaAlteradaAusenteOuExpiraMexidaDa403() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        UriComponents url = partes(enviarComSucesso(loja, produto, GRANDE, MINIATURA).get("grandeUrl").asText());
        String hex = url.getQueryParams().getFirst("assinatura");
        long expira = Long.parseLong(url.getQueryParams().getFirst("expira"));

        mockMvc.perform(get(url.getPath()).param("expira", String.valueOf(expira))
                .param("assinatura", (hex.charAt(0) == 'a' ? "b" : "a") + hex.substring(1)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get(url.getPath()).param("expira", String.valueOf(expira + 86_400)).param("assinatura", hex))
                .andExpect(status().isForbidden());
        mockMvc.perform(get(url.getPath()).param("expira", String.valueOf(expira)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get(url.getPath()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get(url.getPath()).param("expira", "1").param("assinatura", hex))
                .andExpect(status().isForbidden());
        mockMvc.perform(get(url.getPath()).param("expira", "amanha").param("assinatura", hex))
                .andExpect(status().isForbidden())
                .andExpect(content().string(emptyString()));
        mockMvc.perform(get(url.getPath()).param("expira", "99999999999999999999").param("assinatura", hex))
                .andExpect(status().isForbidden())
                .andExpect(content().string(emptyString()));
    }

    /** Sem enumeracao: versao inexistente, mesmo com assinatura valida, da 404 sem corpo. */
    @Test
    void versaoInexistenteComAssinaturaValidaDa404SemCorpo() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        enviarComSucesso(loja, produto, GRANDE, MINIATURA);

        mockMvc.perform(get(assinatura.url(produto, UUID.randomUUID(), TamanhoDaImagem.GRANDE)))
                .andExpect(status().isNotFound())
                .andExpect(content().string(emptyString()));
    }

    @Test
    void tamanhoDesconhecidoDa404() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        String url = enviarComSucesso(loja, produto, GRANDE, MINIATURA).get("grandeUrl").asText();

        mockMvc.perform(get(url.replace("/grande?", "/media?"))).andExpect(status().isNotFound());
    }

    /** Caminho que nao existe sob a rota publica: 404 com ApiError e mensagem fixa, nunca 500. */
    @Test
    void caminhoInexistenteNaRotaPublicaDa404() throws Exception {
        mockMvc.perform(get("/api/imagens/produtos/x"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.mensagem").value("Recurso não encontrado."));
    }

    /** Metodo que a rota nao tem: 405 com ApiError e mensagem fixa, nunca 500. */
    @Test
    void metodoNaoSuportadoNoEnvioDa405() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);

        mockMvc.perform(post("/api/produtos/{id}/imagem", produto)
                        .header(HttpHeaders.AUTHORIZATION, token(loja.admin())))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.status").value(405))
                .andExpect(jsonPath("$.mensagem").value("Método não permitido para este recurso."));
    }

    /** A rota publica so aceita GET: POST, PUT e DELETE nunca dao 200, com ou sem JWT. */
    @Test
    void rotaPublicaSoAceitaGet() throws Exception {
        Loja loja = novaLoja();
        UUID produto = novoProduto(loja);
        String url = enviarComSucesso(loja, produto, GRANDE, MINIATURA).get("grandeUrl").asText();

        mockMvc.perform(post(url)).andExpect(status().isUnauthorized());
        mockMvc.perform(post(url).header(HttpHeaders.AUTHORIZATION, token(loja.admin())))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete(url).header(HttpHeaders.AUTHORIZATION, token(loja.admin())))
                .andExpect(status().isForbidden());
        assertThat(imagensGravadas(produto)).isEqualTo(1);
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private record Loja(Long admin, Long operador, UUID unidade) {
    }

    private ResultActions enviar(Long usuario, UUID produto, byte[] grande, byte[] miniatura) throws Exception {
        MockMultipartHttpServletRequestBuilder pedido = multipart(HttpMethod.PUT, "/api/produtos/{id}/imagem",
                produto);
        return mockMvc.perform(pedido.file(parte("grande", grande)).file(parte("miniatura", miniatura))
                .header(HttpHeaders.AUTHORIZATION, token(usuario)));
    }

    private JsonNode enviarComSucesso(Loja loja, UUID produto, byte[] grande, byte[] miniatura) throws Exception {
        String corpo = enviar(loja.admin(), produto, grande, miniatura)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(corpo);
    }

    private static MockMultipartFile parte(String nome, byte[] bytes) {
        return new MockMultipartFile(nome, nome + ".webp", "image/webp", bytes);
    }

    /** PUT pelo Tomcat de verdade (porta aleatoria), onde valem os limites do multipart. */
    private ResponseEntity<String> enviarPeloServidor(Loja loja, UUID produto, MultiValueMap<String, Object> partes) {
        HttpHeaders cabecalhos = new HttpHeaders();
        cabecalhos.setContentType(MediaType.MULTIPART_FORM_DATA);
        cabecalhos.set(HttpHeaders.AUTHORIZATION, token(loja.admin()));
        return restTemplate.exchange("/api/produtos/{id}/imagem", HttpMethod.PUT, new HttpEntity<>(partes, cabecalhos),
                String.class, produto);
    }

    private static ByteArrayResource recurso(String nomeDoArquivo, byte[] bytes) {
        return new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return nomeDoArquivo;
            }
        };
    }

    private static UriComponents partes(String url) {
        return UriComponentsBuilder.fromUriString(url).build();
    }

    private static String versao(String url) {
        List<String> segmentos = partes(url).getPathSegments();
        return segmentos.get(segmentos.size() - 2);
    }

    private long imagensDoIdInterno(Long produtoId) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM produto_imagens WHERE produto_id = ?", Long.class,
                produtoId);
    }

    private long imagensGravadas(UUID produto) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM produto_imagens i JOIN produtos p"
                + " ON p.id = i.produto_id WHERE p.uuid = ?", Long.class, produto);
    }

    private String token(Long usuario) {
        return "Bearer " + jwtService.gerarToken(usuarioRepository.findById(usuario).orElseThrow());
    }

    private UUID novoProduto(Loja loja) {
        ProdutoRequest request = new ProdutoRequest("Produto " + SEQUENCIA.incrementAndGet(), null, null,
                loja.unidade(), null, null, null, null, new BigDecimal("10.00"), null, null, null, null, null,
                List.of(), null, null, null, null, null, null, true, null);
        return produtoService.cadastrarParaUsuario(loja.admin(), request).id();
    }

    /** Empresa FISICA (sem CNPJ) com as unidades padrao, um ADMIN e um OPERADOR; nomes unicos por teste. */
    private Loja novaLoja() {
        String sufixo = String.valueOf(SEQUENCIA.incrementAndGet());
        String nome = "Empresa Imagem " + sufixo;
        Empresa empresa = new Empresa(nome);
        empresa.atualizarCadastro(nome, "1133224455", "contato" + sufixo + "@imagem.test", TipoPessoa.FISICA, null,
                null, null,
                new RepresentanteLegal("Representante " + sufixo, "11144477735", "11987654321",
                        "rep" + sufixo + "@imagem.test"),
                new Endereco("01001000", "Praça da Sé", "S/N", null, "Sé", "São Paulo", "SP"));
        Empresa gravada = empresaRepository.saveAndFlush(empresa);
        unidadeService.criarPadroes(gravada);
        Long admin = usuarioRepository.saveAndFlush(new Usuario(gravada, "Admin", "admin" + sufixo + "@imagem.test",
                "hash-irrelevante-no-teste", "ADMIN")).getId();
        Long operador = usuarioRepository.saveAndFlush(new Usuario(gravada, "Operador",
                "operador" + sufixo + "@imagem.test", "hash-irrelevante-no-teste", "OPERADOR")).getId();
        UUID unidade = unidadeService.listarParaUsuario(admin, null).stream()
                .filter(encontrada -> encontrada.sigla().equals("UN"))
                .map(UnidadeMedidaResponse::id)
                .findFirst()
                .orElseThrow();
        return new Loja(admin, operador, unidade);
    }
}
