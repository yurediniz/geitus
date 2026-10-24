package com.geitus.app.catalog.unidade;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.CatalogoConflitoException;
import com.geitus.app.catalog.CatalogoNaoEncontradoException;
import com.geitus.app.catalog.ContagensPorId;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.UsoDoProdutoNoEstoque;
import com.geitus.app.catalog.unidade.UnidadesPadrao.UnidadePadrao;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaRequest;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Regras de negocio das unidades de medida
 * (docs/modules/categorias-e-unidades.md, secao 3).
 *
 * <p>Mesmo desenho do {@code ClienteService}: a API publica para o controller
 * e composta pelos metodos {@code *ParaUsuario}, que recebem o
 * {@code idUsuario} do JWT e resolvem a empresa internamente (DEC-016).
 * Unidade de outra empresa e tratada como inexistente (404).
 * {@link #buscarDaEmpresa} e {@link #criarPadroes} servem a outros modulos
 * (produto e bootstrap da empresa).
 */
@Service
public class UnidadeMedidaService {

    static final String MENSAGEM_NAO_ENCONTRADA = "Unidade de medida não encontrada.";
    static final String MENSAGEM_SIGLA_REPETIDA = "Já existe uma unidade com esta sigla.";
    static final String MENSAGEM_SIGLA_LONGA = "A sigla deve ter no máximo 20 caracteres.";
    /** Espelha {@code sigla VARCHAR(20)} da V6 e o {@code @Size} do request. */
    private static final int TAMANHO_MAXIMO_SIGLA = 20;
    static final String MENSAGEM_FRACAO_EM_USO = "Esta unidade é usada por produtos com movimentação de estoque.";
    private static final String CAMPO_FRACIONADA = "fracionada";
    private static final String MENSAGEM_EM_USO =
            "Esta unidade está em uso por %d produto(s). Inative-a para que não apareça em novos cadastros.";

    private final UnidadeMedidaRepository unidadeRepository;
    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;
    private final UsoDoProdutoNoEstoque usoNoEstoque;

    public UnidadeMedidaService(UnidadeMedidaRepository unidadeRepository, EmpresaRepository empresaRepository,
            UsuarioRepository usuarioRepository, UsoDoProdutoNoEstoque usoNoEstoque) {
        this.unidadeRepository = unidadeRepository;
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
        this.usoNoEstoque = usoNoEstoque;
    }

    // ---------- API publica (empresa sempre resolvida do usuario do JWT) ----------

    /** Lista as unidades da empresa ordenadas por sigla, com o uso de cada uma. */
    @Transactional(readOnly = true)
    public List<UnidadeMedidaResponse> listarParaUsuario(Long idUsuario, Boolean ativo) {
        Long empresaId = resolverEmpresaId(idUsuario);
        List<UnidadeMedida> unidades = ativo == null
                ? unidadeRepository.findByEmpresa_IdOrderBySigla(empresaId)
                : unidadeRepository.findByEmpresa_IdAndAtivoOrderBySigla(empresaId, ativo);
        Map<Long, Long> usoPorUnidade = ContagensPorId.de(unidadeRepository.contarUsoPorUnidade(empresaId));
        return unidades.stream()
                .map(unidade -> UnidadeMedidaResponse.de(unidade, usoPorUnidade.getOrDefault(unidade.getId(), 0L)))
                .toList();
    }

    @Transactional
    public UnidadeMedidaResponse cadastrarParaUsuario(Long idUsuario, UnidadeMedidaRequest request) {
        Long empresaId = resolverEmpresaId(idUsuario);
        String sigla = normalizarSigla(request.sigla());
        if (unidadeRepository.existsBySiglaAndEmpresa_Id(sigla, empresaId)) {
            throw new CatalogoConflitoException(MENSAGEM_SIGLA_REPETIDA);
        }
        Empresa empresa = empresaRepository.findById(empresaId).orElseThrow(CredenciaisInvalidasException::new);
        UnidadeMedida unidade = new UnidadeMedida(empresa, sigla, request.descricao().trim(), request.fracionada());
        return UnidadeMedidaResponse.de(unidadeRepository.save(unidade), 0L);
    }

    @Transactional
    public UnidadeMedidaResponse atualizarParaUsuario(Long idUsuario, UUID id, UnidadeMedidaRequest request) {
        Long empresaId = resolverEmpresaId(idUsuario);
        UnidadeMedida unidade = buscarDaEmpresa(empresaId, id);
        String sigla = normalizarSigla(request.sigla());
        if (unidadeRepository.existsBySiglaAndEmpresa_IdAndIdNot(sigla, empresaId, unidade.getId())) {
            throw new CatalogoConflitoException(MENSAGEM_SIGLA_REPETIDA);
        }
        exigirFracaoMantidaSeMovimentada(empresaId, unidade, request.fracionada());
        unidade.atualizar(sigla, request.descricao().trim(), request.fracionada());
        return responder(unidadeRepository.save(unidade));
    }

    @Transactional
    public UnidadeMedidaResponse inativarParaUsuario(Long idUsuario, UUID id) {
        UnidadeMedida unidade = buscarDaEmpresa(resolverEmpresaId(idUsuario), id);
        unidade.inativar();
        return responder(unidadeRepository.save(unidade));
    }

    @Transactional
    public UnidadeMedidaResponse reativarParaUsuario(Long idUsuario, UUID id) {
        UnidadeMedida unidade = buscarDaEmpresa(resolverEmpresaId(idUsuario), id);
        unidade.ativar();
        return responder(unidadeRepository.save(unidade));
    }

    /**
     * Exclui fisicamente a unidade, desde que nenhum produto a use como
     * unidade de venda ou numa embalagem; senao 409 com a contagem.
     */
    @Transactional
    public void excluirParaUsuario(Long idUsuario, UUID id) {
        UnidadeMedida unidade = buscarDaEmpresa(resolverEmpresaId(idUsuario), id);
        long emUso = contarUso(unidade);
        if (emUso > 0) {
            throw new CatalogoConflitoException(String.format(MENSAGEM_EM_USO, emUso));
        }
        unidadeRepository.delete(unidade);
    }

    // ---------- Uso por outros modulos ----------

    /** Unidade da empresa pelo UUID publico; de outra empresa ou inexistente → 404. */
    @Transactional(readOnly = true)
    public UnidadeMedida buscarDaEmpresa(Long empresaId, UUID id) {
        return unidadeRepository.findByUuidAndEmpresa_Id(id, empresaId)
                .orElseThrow(() -> new CatalogoNaoEncontradoException(MENSAGEM_NAO_ENCONTRADA));
    }

    /**
     * Cria as unidades padrao ({@link UnidadesPadrao}) que ainda faltam na
     * empresa. Idempotente: compara pela sigla e nunca duplica.
     */
    @Transactional
    public void criarPadroes(Empresa empresa) {
        for (UnidadePadrao padrao : UnidadesPadrao.TODAS) {
            if (!unidadeRepository.existsBySiglaAndEmpresa_Id(padrao.sigla(), empresa.getId())) {
                unidadeRepository.save(
                        new UnidadeMedida(empresa, padrao.sigla(), padrao.descricao(), padrao.fracionada()));
            }
        }
    }

    /** Quantidade de produtos que usam a unidade (venda ou embalagem). */
    @Transactional(readOnly = true)
    public long contarUso(UnidadeMedida unidade) {
        return unidadeRepository.contarProdutosQueUsam(unidade.getId());
    }

    // ---------- Apoio ----------

    /**
     * Unidade usada por produto com movimentos de estoque nao deixa de ser
     * fracionada: as quantidades fracionadas ja gravadas ficariam invalidas
     * (docs/modules/produtos-estoque.md, 4.8; DEC-031). Ligar a fracao e livre.
     */
    private void exigirFracaoMantidaSeMovimentada(Long empresaId, UnidadeMedida unidade, boolean fracionada) {
        boolean deixaDeSerFracionada = unidade.isFracionada() && !fracionada;
        if (deixaDeSerFracionada && usoNoEstoque.algumProdutoDaUnidadeTemMovimentos(empresaId, unidade.getId())) {
            throw new RegraDeNegocioException(MENSAGEM_FRACAO_EM_USO, CAMPO_FRACIONADA);
        }
    }

    private UnidadeMedidaResponse responder(UnidadeMedida unidade) {
        return UnidadeMedidaResponse.de(unidade, contarUso(unidade));
    }

    /**
     * Sigla sem espacos nas pontas e em maiusculas (spec 3.1). O tamanho e
     * conferido de novo DEPOIS de normalizar: a caixa alta pode aumentar o
     * texto (ex.: "ß" vira "SS"), e o {@code @Size} do request so viu o valor
     * original — sem isto, o banco recusaria com erro generico.
     */
    private static String normalizarSigla(String sigla) {
        String normalizada = sigla.trim().toUpperCase(Locale.ROOT);
        if (normalizada.length() > TAMANHO_MAXIMO_SIGLA) {
            throw new RegraDeNegocioException(MENSAGEM_SIGLA_LONGA);
        }
        return normalizada;
    }

    private Long resolverEmpresaId(Long idUsuario) {
        Usuario usuario = usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
        return usuario.getEmpresaId();
    }
}
