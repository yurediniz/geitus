package com.geitus.app.catalog.imagem;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoRepository;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Regras do {@link ImagensDoProduto} que o IT nao alcanca: a falha de leitura
 * da parte enviada (400, nunca 500) e o rastro provisorio no log, so com
 * identificadores (como o {@code registrarExclusao} do {@code ProdutoService}).
 */
@ExtendWith(MockitoExtension.class)
class ImagensDoProdutoTest {

    private static final Long ID_USUARIO = 9L;
    private static final Long EMPRESA_ID = 1L;
    private static final Long PRODUTO_ID = 5L;
    private static final UUID PRODUTO_UUID = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final Clock RELOGIO = Clock.fixed(Instant.parse("2026-10-24T15:00:00Z"),
            ZoneId.of("America/Sao_Paulo"));
    private static final byte[] GRANDE = ImagensDeTeste.webpVp8(1200, 900);
    private static final byte[] MINIATURA = ImagensDeTeste.webpVp8(200, 150);

    @Mock
    private ImagemDoProdutoRepository imagemRepository;

    @Mock
    private ProdutoRepository produtoRepository;

    @Mock
    private UsuarioRepository usuarioRepository;

    private ImagensDoProduto imagens;

    @BeforeEach
    void setUp() {
        imagens = new ImagensDoProduto(imagemRepository, produtoRepository, usuarioRepository,
                new AssinaturaDeImagem("segredo-de-teste-das-imagens-do-geitus-0123456789", RELOGIO), RELOGIO);
        Usuario usuario = mock(Usuario.class);
        when(usuario.isAtivo()).thenReturn(true);
        when(usuario.getEmpresaId()).thenReturn(EMPRESA_ID);
        when(usuarioRepository.findById(ID_USUARIO)).thenReturn(Optional.of(usuario));
    }

    @Test
    void falhaAoLerAParteEPartesAusentesENadaEGravado() throws IOException {
        MultipartFile ilegivel = mock(MultipartFile.class);
        when(ilegivel.isEmpty()).thenReturn(false);
        when(ilegivel.getBytes()).thenThrow(new IOException("conexao caiu no meio do envio"));

        assertThatThrownBy(() -> imagens.enviar(ID_USUARIO, PRODUTO_UUID, ilegivel, parte(MINIATURA)))
                .isInstanceOf(ImagemInvalidaException.class)
                .hasMessage("Envie a imagem grande e a miniatura.");
        verify(produtoRepository, never()).buscarPorUuidParaAtualizar(any(), any());
        verify(imagemRepository, never()).saveAndFlush(any());
    }

    @Test
    void envioDeixaORastroSoComIdentificadores() {
        produtoEncontrado();
        when(imagemRepository.findById(PRODUTO_ID)).thenReturn(Optional.empty());

        List<ILoggingEvent> eventos = capturarLog(() -> imagens.enviar(ID_USUARIO, PRODUTO_UUID, parte(GRANDE),
                parte(MINIATURA)));

        assertThat(eventos).singleElement().satisfies(evento -> {
            assertThat(evento.getLevel()).isEqualTo(Level.INFO);
            assertThat(evento.getFormattedMessage()).matches("Imagem do produto enviada: usuario=9 empresa=1 produto="
                    + PRODUTO_UUID + " versao=[0-9a-f-]{36}");
        });
    }

    @Test
    void remocaoDeixaORastroComAVersaoRemovida() {
        produtoEncontrado();
        UUID versao = UUID.randomUUID();
        when(imagemRepository.resumo(EMPRESA_ID, PRODUTO_ID)).thenReturn(Optional.of(new ResumoDaImagem(PRODUTO_ID,
                PRODUTO_UUID, versao, TipoDeImagem.WEBP, 1200, 900, LocalDateTime.now(RELOGIO))));
        when(imagemRepository.remover(EMPRESA_ID, PRODUTO_ID)).thenReturn(1);

        List<ILoggingEvent> eventos = capturarLog(() -> {
            imagens.remover(ID_USUARIO, PRODUTO_UUID);
            return null;
        });

        assertThat(eventos).singleElement().satisfies(evento -> assertThat(evento.getFormattedMessage())
                .isEqualTo("Imagem do produto removida: usuario=9 empresa=1 produto=" + PRODUTO_UUID + " versao="
                        + versao));
    }

    @Test
    void remocaoSemImagemResponde404ESemRastro() {
        produtoEncontrado();
        when(imagemRepository.resumo(EMPRESA_ID, PRODUTO_ID)).thenReturn(Optional.empty());

        List<ILoggingEvent> eventos = capturarLog(() -> {
            assertThatThrownBy(() -> imagens.remover(ID_USUARIO, PRODUTO_UUID))
                    .isInstanceOf(ImagemNaoEncontradaException.class);
            return null;
        });

        assertThat(eventos).isEmpty();
        verify(imagemRepository, never()).remover(any(), any());
    }

    // ------------------------------------------------------------------

    private void produtoEncontrado() {
        Produto produto = mock(Produto.class);
        when(produto.getId()).thenReturn(PRODUTO_ID);
        lenient().when(produto.getUuid()).thenReturn(PRODUTO_UUID);
        when(produtoRepository.buscarPorUuidParaAtualizar(PRODUTO_UUID, EMPRESA_ID)).thenReturn(Optional.of(produto));
    }

    private static MockMultipartFile parte(byte[] bytes) {
        return new MockMultipartFile("parte", bytes);
    }

    private static List<ILoggingEvent> capturarLog(Supplier<?> acao) {
        Logger log = (Logger) LoggerFactory.getLogger(ImagensDoProduto.class);
        ListAppender<ILoggingEvent> capturados = new ListAppender<>();
        capturados.start();
        log.addAppender(capturados);
        try {
            acao.get();
        } finally {
            log.detachAppender(capturados);
        }
        return capturados.list;
    }
}
