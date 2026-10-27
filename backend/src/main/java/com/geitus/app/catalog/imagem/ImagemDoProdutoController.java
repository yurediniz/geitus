package com.geitus.app.catalog.imagem;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.geitus.app.catalog.dto.ImagemResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Envio e remocao da imagem do produto (docs/modules/produtos.md).
 *
 * <p>Controller fino: recebe as duas partes do multipart e delega ao
 * {@link ImagensDoProduto}. A empresa vem do usuario do JWT, nunca da
 * requisicao (DEC-016); o {@code {id}} e o UUID publico do produto (DEC-019).
 * So ADMIN, pelo {@code SecurityConfig} (PUT e DELETE sob {@code /api/produtos/**}).
 */
@RestController
@RequestMapping("/api/produtos/{id}/imagem")
@Tag(name = "Produtos", description = "Cadastro e consulta de produtos da empresa do usuario autenticado")
public class ImagemDoProdutoController {

    private final ImagensDoProduto imagens;

    public ImagemDoProdutoController(ImagensDoProduto imagens) {
        this.imagens = imagens;
    }

    @Operation(summary = "Envia ou troca a imagem do produto (somente ADMIN)",
            description = "multipart/form-data com as partes 'grande' (WebP ou JPEG, ate 1200 px e 400 KB) e "
                    + "'miniatura' (o mesmo tipo, ate 200 px e 40 KB), ja comprimidas no navegador. O tipo real "
                    + "e conferido pelos primeiros bytes (o Content-Type enviado e ignorado). Cada envio gera uma "
                    + "versao nova, e as URLs antigas deixam de funcionar. Produto de outra empresa: 404. Acima "
                    + "de 512 KB por parte ou 1 MB no total: 413.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @PutMapping
    public ResponseEntity<ImagemResponse> enviar(@AuthenticationPrincipal Long idUsuario, @PathVariable UUID id,
            @RequestPart("grande") MultipartFile grande, @RequestPart("miniatura") MultipartFile miniatura) {
        return ResponseEntity.ok(imagens.enviar(idUsuario, id, grande, miniatura));
    }

    @Operation(summary = "Remove a imagem do produto (somente ADMIN)",
            description = "204 ao remover; 404 se o produto nao tem imagem ou e de outra empresa.",
            security = @SecurityRequirement(name = "bearer-jwt"))
    @DeleteMapping
    public ResponseEntity<Void> remover(@AuthenticationPrincipal Long idUsuario, @PathVariable UUID id) {
        imagens.remover(idUsuario, id);
        return ResponseEntity.noContent().build();
    }
}
