package com.geitus.app.catalog.imagem;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoNaoEncontradoException;
import com.geitus.app.catalog.ProdutoRepository;
import com.geitus.app.catalog.dto.ImagemResponse;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Regras da imagem do produto (docs/modules/produtos-imagem.md, 4; DEC-040).
 *
 * <p>Envio e remocao: a empresa vem sempre do usuario do JWT e o produto e
 * buscado nela (DEC-016), com a trava de escrita da linha (a mesma da edicao),
 * entao dois envios simultaneos do mesmo produto se enfileiram. Produto de
 * outra empresa responde 404; o inativo tambem aceita a imagem. A imagem passa
 * pela {@link ConferenciaDaImagem} antes de qualquer acesso ao banco e e
 * gravada como veio (sem recomprimir), com uma {@code versao} nova a cada
 * envio.
 *
 * <p>Leitura publica: acha a imagem pelo UUID do produto e pela versao; a
 * assinatura da URL ja foi conferida pelo controller.
 */
@Service
public class ImagensDoProduto {

    private final ImagemDoProdutoRepository imagemRepository;
    private final ProdutoRepository produtoRepository;
    private final UsuarioRepository usuarioRepository;
    private final AssinaturaDeImagem assinatura;
    private final Clock relogio;

    public ImagensDoProduto(ImagemDoProdutoRepository imagemRepository, ProdutoRepository produtoRepository,
            UsuarioRepository usuarioRepository, AssinaturaDeImagem assinatura, Clock relogio) {
        this.imagemRepository = imagemRepository;
        this.produtoRepository = produtoRepository;
        this.usuarioRepository = usuarioRepository;
        this.assinatura = assinatura;
        this.relogio = relogio;
    }

    /** Grava (ou substitui) a imagem do produto e devolve as URLs assinadas da versao nova. */
    @Transactional
    public ImagemResponse enviar(Long idUsuario, UUID produtoId, MultipartFile grande, MultipartFile miniatura) {
        Long empresaId = resolverEmpresaId(idUsuario);
        ImagemConferida conferida = ConferenciaDaImagem.conferir(bytesDe(grande), bytesDe(miniatura));
        Produto produto = travarProduto(empresaId, produtoId);
        LocalDateTime agora = LocalDateTime.now(relogio).truncatedTo(ChronoUnit.MICROS);
        ImagemDoProduto imagem = imagemRepository.findById(produto.getId())
                .map(atual -> {
                    atual.substituir(conferida, idUsuario, agora);
                    return atual;
                })
                .orElseGet(() -> new ImagemDoProduto(empresaId, produto.getId(), conferida, idUsuario, agora));
        imagemRepository.saveAndFlush(imagem);
        return ImagemResponse.de(imagem.resumo(produto.getUuid()), assinatura);
    }

    /** Remove a imagem do produto; sem imagem, 404. */
    @Transactional
    public void remover(Long idUsuario, UUID produtoId) {
        Long empresaId = resolverEmpresaId(idUsuario);
        Produto produto = travarProduto(empresaId, produtoId);
        if (imagemRepository.remover(empresaId, produto.getId()) == 0) {
            throw new ImagemNaoEncontradaException();
        }
    }

    /** Os bytes de uma versao, se ela ainda for a atual do produto (versao trocada ou removida: vazio). */
    @Transactional(readOnly = true)
    public Optional<BytesDaImagem> ler(UUID produtoUuid, UUID versao, TamanhoDaImagem tamanho) {
        return switch (tamanho) {
            case GRANDE -> imagemRepository.grande(produtoUuid, versao);
            case MINIATURA -> imagemRepository.miniatura(produtoUuid, versao);
        };
    }

    private Produto travarProduto(Long empresaId, UUID produtoId) {
        return produtoRepository.buscarPorUuidParaAtualizar(produtoId, empresaId)
                .orElseThrow(ProdutoNaoEncontradoException::new);
    }

    /** Parte ausente ou vazia vira {@code null}: a conferencia responde "Envie a imagem grande e a miniatura.". */
    private static byte[] bytesDe(MultipartFile parte) {
        if (parte == null || parte.isEmpty()) {
            return null;
        }
        try {
            return parte.getBytes();
        } catch (IOException falhaNaLeitura) {
            throw new UncheckedIOException("Nao foi possivel ler a parte enviada.", falhaNaLeitura);
        }
    }

    private Long resolverEmpresaId(Long idUsuario) {
        return usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .map(Usuario::getEmpresaId)
                .orElseThrow(CredenciaisInvalidasException::new);
    }
}
