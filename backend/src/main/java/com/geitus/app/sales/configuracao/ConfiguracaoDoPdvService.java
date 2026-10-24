package com.geitus.app.sales.configuracao;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.cashier.HorarioDoCaixa;
import com.geitus.app.iam.ResolvedorDoUsuarioAutenticado;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioAutenticado;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.sales.configuracao.dto.ConfiguracaoDoPdvRequest;
import com.geitus.app.sales.configuracao.dto.ConfiguracaoDoPdvResponse;

/**
 * Configuracao do PDV (docs/modules/pdv.md, 3.10): todos leem (a tela do PDV
 * precisa das duas regras); so o ADMIN altera, conferido no
 * {@code SecurityConfig} pelo token e aqui pelo perfil do banco (um ADMIN
 * rebaixado com token antigo recebe 403). A alteracao registra quem e quando.
 */
@Service
public class ConfiguracaoDoPdvService {

    private static final int CASAS_DO_PERCENTUAL = 2;

    private final ConfiguracaoDoPdvRepository configuracaoRepository;
    private final UsuarioRepository usuarioRepository;
    private final ResolvedorDoUsuarioAutenticado resolvedor;
    private final Clock relogio;

    public ConfiguracaoDoPdvService(ConfiguracaoDoPdvRepository configuracaoRepository,
            UsuarioRepository usuarioRepository, ResolvedorDoUsuarioAutenticado resolvedor, Clock relogio) {
        this.configuracaoRepository = configuracaoRepository;
        this.usuarioRepository = usuarioRepository;
        this.resolvedor = resolvedor;
        this.relogio = relogio;
    }

    @Transactional(readOnly = true)
    public ConfiguracaoDoPdvResponse buscarParaUsuario(Long idUsuario) {
        Long empresaId = resolvedor.resolver(idUsuario).empresaId();
        return configuracaoRepository.findById(empresaId)
                .map(this::resposta)
                .orElse(new ConfiguracaoDoPdvResponse(RegrasDoPdv.PADRAO.venderSemEstoque(),
                        RegrasDoPdv.PADRAO.descontoMaximoOperador(), null, null));
    }

    @Transactional
    public ConfiguracaoDoPdvResponse salvarParaUsuario(Long idUsuario, ConfiguracaoDoPdvRequest request) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario).exigirAdmin();
        OffsetDateTime agora = OffsetDateTime.now(relogio).truncatedTo(ChronoUnit.MICROS);
        BigDecimal desconto = request.descontoMaximoOperador().setScale(CASAS_DO_PERCENTUAL, RoundingMode.UNNECESSARY);
        configuracaoRepository.gravar(usuario.empresaId(), request.venderSemEstoque(), desconto, usuario.usuarioId(),
                agora);
        return new ConfiguracaoDoPdvResponse(request.venderSemEstoque(), desconto, usuario.nome(),
                HorarioDoCaixa.noFuso(relogio, agora));
    }

    /** As regras que valem agora na empresa: os padroes sem configuracao gravada. */
    @Transactional(readOnly = true)
    public RegrasDoPdv daEmpresa(Long empresaId) {
        return configuracaoRepository.findById(empresaId)
                .map(ConfiguracaoDoPdv::regras)
                .orElse(RegrasDoPdv.PADRAO);
    }

    private ConfiguracaoDoPdvResponse resposta(ConfiguracaoDoPdv configuracao) {
        String nome = usuarioRepository.findById(configuracao.getAtualizadoPor()).map(Usuario::getNome).orElse(null);
        RegrasDoPdv regras = configuracao.regras();
        return new ConfiguracaoDoPdvResponse(regras.venderSemEstoque(), regras.descontoMaximoOperador(), nome,
                HorarioDoCaixa.noFuso(relogio, configuracao.getAtualizadoEm()));
    }
}
