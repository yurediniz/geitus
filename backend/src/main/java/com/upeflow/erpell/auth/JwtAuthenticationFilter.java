package com.upeflow.erpell.auth;

import java.io.IOException;
import java.util.List;

import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Filtro que autentica requisicoes a partir do cabecalho
 * {@code Authorization: Bearer <token>}.
 *
 * <p>Se o token for valido, popula o {@code SecurityContext} com uma autenticacao
 * cujo principal e o id do usuario e cuja authority reflete o perfil. Se o token
 * estiver ausente, expirado, adulterado ou com assinatura invalida, a requisicao
 * segue sem autenticacao — o que resulta em 401 nas rotas protegidas (via
 * {@code AuthenticationEntryPoint}). O filtro nunca lanca excecao para o cliente.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String PREFIXO_BEARER = "Bearer ";

    private final JwtService jwtService;

    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {

        String token = extrairToken(request);

        if (token != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            autenticarComToken(token, request);
        }

        filterChain.doFilter(request, response);
    }

    private void autenticarComToken(String token, HttpServletRequest request) {
        try {
            Claims claims = jwtService.extrairClaims(token);
            Long idUsuario = Long.valueOf(claims.getSubject());
            String perfil = claims.get("perfil", String.class);

            List<SimpleGrantedAuthority> authorities = perfil == null
                    ? List.of()
                    : List.of(new SimpleGrantedAuthority("ROLE_" + perfil));

            UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(idUsuario, null, authorities);
            auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

            SecurityContextHolder.getContext().setAuthentication(auth);
        } catch (Exception ex) {
            // Token invalido/expirado/adulterado: segue sem autenticacao.
            // Nao propaga o erro nem vaza detalhes; a rota protegida respondera 401.
            SecurityContextHolder.clearContext();
        }
    }

    private String extrairToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith(PREFIXO_BEARER)) {
            String token = header.substring(PREFIXO_BEARER.length()).trim();
            return token.isEmpty() ? null : token;
        }
        return null;
    }
}
