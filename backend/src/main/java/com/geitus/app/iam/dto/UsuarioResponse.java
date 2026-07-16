package com.geitus.app.iam.dto;

import java.time.LocalDateTime;

import com.geitus.app.company.dto.EmpresaResponse;
import com.geitus.app.iam.Usuario;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Representacao publica de um usuario.
 *
 * <p>NUNCA inclui a senha (hash) nem qualquer dado sensivel. A empresa vem
 * aninhada (ver DEC-016: usuario sempre vinculado a uma empresa), permitindo
 * ao front-end ler o contexto do usuario sem uma chamada adicional.
 *
 * <p>Reutilizado tanto pela autenticacao (login / {@code /me}) quanto pela
 * gestao de usuarios; por isso expoe {@code ativo} e os timestamps, uteis na
 * tela de gestao. O mapeamento acessa a empresa (associacao LAZY) e por isso
 * deve ser feito dentro de uma transacao (services {@code @Transactional}).
 */
@Schema(description = "Dados publicos de um usuario")
public record UsuarioResponse(
        Long id,
        String nome,
        String email,
        String perfil,
        boolean ativo,
        LocalDateTime criadoEm,
        LocalDateTime atualizadoEm,
        EmpresaResponse empresa) {

    public static UsuarioResponse de(Usuario usuario) {
        return new UsuarioResponse(
                usuario.getId(),
                usuario.getNome(),
                usuario.getEmail(),
                usuario.getPerfil(),
                usuario.isAtivo(),
                usuario.getCriadoEm(),
                usuario.getAtualizadoEm(),
                EmpresaResponse.de(usuario.getEmpresa()));
    }
}
