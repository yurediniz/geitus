package com.upeflow.erpell.auth;

import java.nio.charset.StandardCharsets;
import java.util.Date;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.upeflow.erpell.user.Usuario;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

/**
 * Geracao e validacao de tokens JWT (HS256) usando jjwt 0.12.x.
 *
 * <p>Claims minimos: {@code subject} = id do usuario, {@code perfil} e
 * {@code empresaId}. A validacao (assinatura e expiracao) e feita pelo parser
 * do jjwt; tokens invalidos lancam excecao, tratada pelo filtro de autenticacao.
 *
 * <p>Fail-fast: o segredo (HS256) precisa ter pelo menos 256 bits (32 bytes).
 * Se estiver ausente ou curto demais, a aplicacao falha na subida (ver
 * {@code JwtSecretValidator}).
 */
@Service
public class JwtService {

    private final SecretKey chave;
    private final long expiracaoMs;

    public JwtService(
            @Value("${erpell.security.jwt.secret}") String secret,
            @Value("${erpell.security.jwt.expiration}") long expiracaoMs) {
        // A validacao formal do segredo (fail-fast na subida) fica no
        // JwtSecretValidator. Aqui apenas construimos a chave; se o segredo for
        // invalido, o validador ja tera interrompido o startup.
        this.chave = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expiracaoMs = expiracaoMs;
    }

    /**
     * Gera um token para o usuario informado.
     */
    public String gerarToken(Usuario usuario) {
        Date agora = new Date();
        Date expiracao = new Date(agora.getTime() + expiracaoMs);

        return Jwts.builder()
                .subject(String.valueOf(usuario.getId()))
                .claim("perfil", usuario.getPerfil())
                .claim("empresaId", usuario.getEmpresaId())
                .issuedAt(agora)
                .expiration(expiracao)
                .signWith(chave)
                .compact();
    }

    /**
     * Valida o token (assinatura e expiracao) e retorna suas claims.
     *
     * @throws io.jsonwebtoken.JwtException se o token for invalido, expirado,
     *         adulterado ou com assinatura incorreta.
     */
    public Claims extrairClaims(String token) {
        return Jwts.parser()
                .verifyWith(chave)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /**
     * Extrai o id do usuario (subject) de um token valido.
     */
    public Long extrairIdUsuario(String token) {
        return Long.valueOf(extrairClaims(token).getSubject());
    }
}
