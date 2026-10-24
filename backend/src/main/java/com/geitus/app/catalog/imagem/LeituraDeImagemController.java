package com.geitus.app.catalog.imagem;

import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Leitura publica da imagem por URL assinada (docs/modules/produtos-imagem.md,
 * 4.2; DEC-040). Sem JWT: a tag {@code <img>} nao o envia, e quem autoriza e a
 * assinatura, conferida antes de qualquer acesso ao banco.
 *
 * <ul>
 *   <li>assinatura ou validade ausente, invalida, nao numerica ou vencida: 403
 *       sem corpo;</li>
 *   <li>tamanho desconhecido, produto ou versao inexistente (inclusive a
 *       versao trocada): 404 sem corpo, sem dizer o que faltou;</li>
 *   <li>OK: os bytes com o tipo gravado, {@code nosniff}, {@code inline}, CSP
 *       sem conteudo ativo, {@code Cross-Origin-Resource-Policy: same-site} e
 *       cache privado e imutavel ate a validade da URL.</li>
 * </ul>
 *
 * <p>A resposta nao revela o nome do produto nem dados da empresa. So GET (o
 * {@code SecurityConfig} nega os demais metodos sob {@code /api/imagens/**}).
 */
@RestController
@RequestMapping("/api/imagens/produtos")
@Tag(name = "Imagens", description = "Leitura publica das imagens dos produtos por URL assinada")
public class LeituraDeImagemController {

    private static final String SEM_FAREJAR_O_TIPO = "nosniff";
    private static final String NA_PROPRIA_PAGINA = "inline";
    /** Aberta direto na aba, a resposta nao roda script nem carrega nada (defesa extra alem do nosniff). */
    private static final String SEM_CONTEUDO_ATIVO = "default-src 'none'; sandbox";
    /** So paginas do mesmo site incorporam a imagem (o frontend e servido pelo mesmo site da API). */
    private static final String SO_NO_MESMO_SITE = "same-site";

    private final AssinaturaDeImagem assinatura;
    private final ImagensDoProduto imagens;

    public LeituraDeImagemController(AssinaturaDeImagem assinatura, ImagensDoProduto imagens) {
        this.assinatura = assinatura;
        this.imagens = imagens;
    }

    @Operation(summary = "Le uma versao da imagem do produto pela URL assinada (sem JWT)",
            description = "Use as URLs de 'imagem' do produto, ja assinadas. Assinatura invalida ou vencida: 403; "
                    + "versao trocada ou inexistente: 404. As duas respostas vem sem corpo.")
    @GetMapping("/{produtoId}/{versao}/{tamanho}")
    public ResponseEntity<byte[]> ler(@PathVariable UUID produtoId, @PathVariable UUID versao,
            @PathVariable String tamanho, @RequestParam(name = "expira", required = false) String expiraRecebida,
            @RequestParam(name = "assinatura", required = false) String assinaturaRecebida) {
        Optional<TamanhoDaImagem> tamanhoPedido = TamanhoDaImagem.doCaminho(tamanho);
        if (tamanhoPedido.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        TamanhoDaImagem pedido = tamanhoPedido.get();
        Optional<Long> expira = epochEmSegundos(expiraRecebida);
        boolean autorizada = expira.isPresent()
                && assinatura.valida(produtoId, versao, pedido, expira.get(), assinaturaRecebida);
        if (!autorizada) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return imagens.ler(produtoId, versao, pedido)
                .map(bytes -> resposta(bytes, versao, pedido, expira.get()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** A validade da URL; ausente, nao numerica ou fora do {@code long}: vazia (a URL nao vale, 403). */
    private static Optional<Long> epochEmSegundos(String valor) {
        if (valor == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(Long.parseLong(valor));
        } catch (NumberFormatException naoNumerica) {
            return Optional.empty();
        }
    }

    private ResponseEntity<byte[]> resposta(BytesDaImagem imagem, UUID versao, TamanhoDaImagem tamanho,
            long expira) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(imagem.tipo().mime()))
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=" + assinatura.segundosAte(expira)
                        + ", immutable")
                .eTag(versao + "-" + tamanho.noCaminho())
                .header("X-Content-Type-Options", SEM_FAREJAR_O_TIPO)
                .header(HttpHeaders.CONTENT_DISPOSITION, NA_PROPRIA_PAGINA)
                .header("Content-Security-Policy", SEM_CONTEUDO_ATIVO)
                .header("Cross-Origin-Resource-Policy", SO_NO_MESMO_SITE)
                .body(imagem.bytes());
    }
}
