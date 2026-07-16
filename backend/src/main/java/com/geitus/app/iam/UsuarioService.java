package com.geitus.app.iam;

import java.util.List;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.geitus.app.iam.dto.AlterarSenhaRequest;
import com.geitus.app.iam.dto.RedefinirSenhaRequest;
import com.geitus.app.iam.dto.UsuarioAtualizarRequest;
import com.geitus.app.iam.dto.UsuarioCriarRequest;
import com.geitus.app.iam.dto.UsuarioResponse;

/**
 * Regras de negocio da gestao de usuarios (dominio {@code iam}).
 *
 * <p>Toda operacao e isolada pela empresa do usuario autenticado (DEC-016): o
 * {@code idUsuario} vem sempre do JWT ({@code @AuthenticationPrincipal}) e a
 * empresa e resolvida internamente a partir dele — nunca de um parametro
 * externo. Um usuario de outra empresa nunca e encontrado (404).
 *
 * <p>Os metodos publicos retornam {@link UsuarioResponse} (DTO), mapeando dentro
 * da transacao — a associacao {@code empresa} e LAZY e nao poderia ser lida no
 * controller. A senha e sempre armazenada como hash BCrypt e nunca exposta.
 *
 * <p>Regras de autoprotecao: nao e possivel inativar/rebaixar o ultimo ADMIN
 * ativo da empresa, nem um ADMIN inativar a si mesmo (evita autolockout).
 */
@Service
public class UsuarioService {

    private static final int TAMANHO_MINIMO_SENHA = 8;
    private static final String PERFIL_ADMIN = Perfil.ADMIN.name();
    private static final String MENSAGEM_PRECISA_DE_ADMIN =
            "A empresa precisa de ao menos um administrador ativo.";

    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;

    public UsuarioService(UsuarioRepository usuarioRepository, PasswordEncoder passwordEncoder) {
        this.usuarioRepository = usuarioRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public List<UsuarioResponse> listarParaUsuario(Long idUsuario, String busca, Boolean ativo, String perfil) {
        Long empresaId = empresaDoUsuario(idUsuario);
        String perfilFiltro = normalizarPerfilFiltro(perfil);

        List<Usuario> usuarios = StringUtils.hasText(busca)
                ? usuarioRepository.buscarPorEmpresaComBusca(empresaId, busca.trim(), ativo, perfilFiltro)
                : usuarioRepository.buscarPorEmpresa(empresaId, ativo, perfilFiltro);

        return usuarios.stream().map(UsuarioResponse::de).toList();
    }

    @Transactional(readOnly = true)
    public UsuarioResponse buscarParaUsuario(Long idUsuario, Long alvoId) {
        return UsuarioResponse.de(buscarNaEmpresa(empresaDoUsuario(idUsuario), alvoId));
    }

    @Transactional
    public UsuarioResponse criarParaUsuario(Long idUsuario, UsuarioCriarRequest request) {
        Usuario autenticado = usuarioAutenticado(idUsuario);
        Perfil perfil = validarPerfil(request.perfil());
        validarSenha(request.senha());

        String email = request.email() == null ? null : request.email().trim();
        if (email != null && usuarioRepository.existsByEmail(email)) {
            throw new ConflitoDeUsuarioException("Já existe um usuário com este e-mail.");
        }

        Usuario novo = new Usuario(autenticado.getEmpresa(), request.nome().trim(), email,
                passwordEncoder.encode(request.senha()), perfil.name());

        return UsuarioResponse.de(usuarioRepository.save(novo));
    }

    @Transactional
    public UsuarioResponse atualizarParaUsuario(Long idUsuario, Long alvoId, UsuarioAtualizarRequest request) {
        Long empresaId = empresaDoUsuario(idUsuario);
        Usuario alvo = buscarNaEmpresa(empresaId, alvoId);
        Perfil novoPerfil = validarPerfil(request.perfil());

        if (rebaixaUltimoAdminAtivo(alvo, novoPerfil, empresaId)) {
            throw new ConflitoDeUsuarioException(MENSAGEM_PRECISA_DE_ADMIN);
        }

        alvo.setNome(request.nome().trim());
        alvo.setPerfil(novoPerfil.name());

        return UsuarioResponse.de(usuarioRepository.save(alvo));
    }

    @Transactional
    public UsuarioResponse inativarParaUsuario(Long idUsuario, Long alvoId) {
        Long empresaId = empresaDoUsuario(idUsuario);
        Usuario alvo = buscarNaEmpresa(empresaId, alvoId);

        if (alvo.getId().equals(idUsuario)) {
            throw new ConflitoDeUsuarioException("Você não pode inativar o próprio usuário.");
        }
        if (ehUltimoAdminAtivo(alvo, empresaId)) {
            throw new ConflitoDeUsuarioException(MENSAGEM_PRECISA_DE_ADMIN);
        }

        alvo.setAtivo(false);
        return UsuarioResponse.de(usuarioRepository.save(alvo));
    }

    @Transactional
    public UsuarioResponse reativarParaUsuario(Long idUsuario, Long alvoId) {
        Usuario alvo = buscarNaEmpresa(empresaDoUsuario(idUsuario), alvoId);
        alvo.setAtivo(true);
        return UsuarioResponse.de(usuarioRepository.save(alvo));
    }

    @Transactional
    public void redefinirSenhaParaUsuario(Long idUsuario, Long alvoId, RedefinirSenhaRequest request) {
        Usuario alvo = buscarNaEmpresa(empresaDoUsuario(idUsuario), alvoId);
        validarSenha(request.novaSenha());
        alvo.setSenhaHash(passwordEncoder.encode(request.novaSenha()));
        usuarioRepository.save(alvo);
    }

    @Transactional
    public void alterarPropriaSenhaParaUsuario(Long idUsuario, AlterarSenhaRequest request) {
        Usuario eu = usuarioAutenticado(idUsuario);
        if (!passwordEncoder.matches(request.senhaAtual(), eu.getSenhaHash())) {
            throw new DadosUsuarioInvalidosException("Senha atual incorreta.");
        }
        validarSenha(request.novaSenha());
        eu.setSenhaHash(passwordEncoder.encode(request.novaSenha()));
        usuarioRepository.save(eu);
    }

    // ---------- Helpers internos ----------

    /** Carrega o usuario autenticado (ativo); inexistente/inativo = nao autenticado. */
    private Usuario usuarioAutenticado(Long idUsuario) {
        return usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
    }

    private Long empresaDoUsuario(Long idUsuario) {
        return usuarioAutenticado(idUsuario).getEmpresaId();
    }

    private Usuario buscarNaEmpresa(Long empresaId, Long alvoId) {
        return usuarioRepository.findByIdAndEmpresa_Id(alvoId, empresaId)
                .orElseThrow(UsuarioNaoEncontradoException::new);
    }

    private Perfil validarPerfil(String perfil) {
        try {
            return Perfil.fromString(perfil);
        } catch (IllegalArgumentException ex) {
            throw new DadosUsuarioInvalidosException(ex.getMessage());
        }
    }

    private void validarSenha(String senha) {
        if (senha == null || senha.length() < TAMANHO_MINIMO_SENHA) {
            throw new DadosUsuarioInvalidosException(
                    "Senha deve ter no mínimo " + TAMANHO_MINIMO_SENHA + " caracteres.");
        }
    }

    private String normalizarPerfilFiltro(String perfil) {
        return StringUtils.hasText(perfil) ? validarPerfil(perfil).name() : null;
    }

    private boolean ehUltimoAdminAtivo(Usuario usuario, Long empresaId) {
        if (!PERFIL_ADMIN.equals(usuario.getPerfil()) || !usuario.isAtivo()) {
            return false;
        }
        return usuarioRepository.countByEmpresa_IdAndPerfilAndAtivoTrue(empresaId, PERFIL_ADMIN) <= 1;
    }

    private boolean rebaixaUltimoAdminAtivo(Usuario alvo, Perfil novoPerfil, Long empresaId) {
        boolean rebaixando = PERFIL_ADMIN.equals(alvo.getPerfil()) && novoPerfil != Perfil.ADMIN;
        return rebaixando && ehUltimoAdminAtivo(alvo, empresaId);
    }
}
