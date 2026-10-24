package com.geitus.app.cashier.configuracao;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.cashier.HorarioDoCaixa;
import com.geitus.app.cashier.configuracao.dto.ConfiguracaoDoCaixaRequest;
import com.geitus.app.cashier.configuracao.dto.ConfiguracaoDoCaixaResponse;
import com.geitus.app.iam.ResolvedorDoUsuarioAutenticado;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioAutenticado;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Configuracao do caixa (docs/modules/caixa.md, 3.9): fechamento cego ligado
 * por padrao; so o ADMIN altera (no {@code SecurityConfig}) e a alteracao
 * registra quem e quando; todos os autenticados leem, porque a tela do caixa
 * precisa do modo.
 */
@Service
public class ConfiguracaoDoCaixaService {

    static final boolean FECHAMENTO_CEGO_PADRAO = true;

    private final ConfiguracaoDoCaixaRepository configuracaoRepository;
    private final UsuarioRepository usuarioRepository;
    private final ResolvedorDoUsuarioAutenticado resolvedor;
    private final Clock relogio;

    public ConfiguracaoDoCaixaService(ConfiguracaoDoCaixaRepository configuracaoRepository,
            UsuarioRepository usuarioRepository, ResolvedorDoUsuarioAutenticado resolvedor, Clock relogio) {
        this.configuracaoRepository = configuracaoRepository;
        this.usuarioRepository = usuarioRepository;
        this.resolvedor = resolvedor;
        this.relogio = relogio;
    }

    @Transactional(readOnly = true)
    public ConfiguracaoDoCaixaResponse buscarParaUsuario(Long idUsuario) {
        Long empresaId = resolvedor.resolver(idUsuario).empresaId();
        return configuracaoRepository.findById(empresaId)
                .map(this::resposta)
                .orElse(new ConfiguracaoDoCaixaResponse(FECHAMENTO_CEGO_PADRAO, null, null));
    }

    @Transactional
    public ConfiguracaoDoCaixaResponse salvarParaUsuario(Long idUsuario, ConfiguracaoDoCaixaRequest request) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario).exigirAdmin();
        OffsetDateTime agora = OffsetDateTime.now(relogio).truncatedTo(ChronoUnit.MICROS);
        boolean fechamentoCego = request.fechamentoCego();
        configuracaoRepository.gravar(usuario.empresaId(), fechamentoCego, usuario.usuarioId(), agora);
        return new ConfiguracaoDoCaixaResponse(fechamentoCego, usuario.nome(), HorarioDoCaixa.noFuso(relogio, agora));
    }

    /** O modo que vale agora na empresa: o padrao ({@code true}) sem configuracao gravada. */
    @Transactional(readOnly = true)
    public boolean fechamentoCego(Long empresaId) {
        return configuracaoRepository.findById(empresaId)
                .map(ConfiguracaoDoCaixa::isFechamentoCego)
                .orElse(FECHAMENTO_CEGO_PADRAO);
    }

    private ConfiguracaoDoCaixaResponse resposta(ConfiguracaoDoCaixa configuracao) {
        String nome = usuarioRepository.findById(configuracao.getAtualizadoPor()).map(Usuario::getNome).orElse(null);
        return new ConfiguracaoDoCaixaResponse(configuracao.isFechamentoCego(), nome,
                HorarioDoCaixa.noFuso(relogio, configuracao.getAtualizadoEm()));
    }
}
