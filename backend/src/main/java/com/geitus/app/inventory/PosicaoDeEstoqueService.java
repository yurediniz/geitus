package com.geitus.app.inventory;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoRepository;
import com.geitus.app.catalog.SituacaoPromocao;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.categoria.CategoriaService;
import com.geitus.app.catalog.listagem.ConsultaDaPosicaoDeEstoque;
import com.geitus.app.catalog.listagem.FiltroDeProdutos;
import com.geitus.app.catalog.listagem.PaginaDeIds;
import com.geitus.app.catalog.listagem.StatusFiltro;
import com.geitus.app.iam.ResolvedorDoUsuarioAutenticado;
import com.geitus.app.inventory.dto.PosicaoDeEstoqueResponse;
import com.geitus.app.inventory.dto.ResumoDaPosicaoResponse;
import com.geitus.app.shared.busca.TextoDeBusca;
import com.geitus.app.shared.paginacao.PaginaResponse;

/**
 * Posicao de estoque de todos os produtos que controlam estoque
 * (docs/modules/estoque.md, regras 22 a 24). So leitura, para qualquer
 * usuario autenticado; a empresa vem sempre do usuario (DEC-016).
 *
 * <p>Consultas por pagina, qualquer que seja o tamanho: usuario, categorias,
 * contagem e ids ({@link ConsultaDaPosicaoDeEstoque}), produtos com unidade e
 * categoria, embalagens e saldos.
 */
@Service
public class PosicaoDeEstoqueService {

    private final ResolvedorDoUsuarioAutenticado resolvedor;
    private final CategoriaService categoriaService;
    private final ConsultaDaPosicaoDeEstoque consulta;
    private final ProdutoRepository produtoRepository;
    private final EstoqueSaldoRepository saldoRepository;
    private final Clock relogio;

    public PosicaoDeEstoqueService(ResolvedorDoUsuarioAutenticado resolvedor, CategoriaService categoriaService,
            ConsultaDaPosicaoDeEstoque consulta, ProdutoRepository produtoRepository,
            EstoqueSaldoRepository saldoRepository, Clock relogio) {
        this.resolvedor = resolvedor;
        this.categoriaService = categoriaService;
        this.consulta = consulta;
        this.produtoRepository = produtoRepository;
        this.saldoRepository = saldoRepository;
        this.relogio = relogio;
    }

    @Transactional(readOnly = true)
    public PaginaResponse<PosicaoDeEstoqueResponse> listarParaUsuario(Long idUsuario, ParametrosDaPosicao parametros) {
        Long empresaId = resolvedor.resolver(idUsuario).empresaId();
        CategoriaArvore categorias = categoriaService.arvoreDaEmpresa(empresaId);
        FiltroDeProdutos filtro = filtro(empresaId, parametros.busca(), parametros.status(),
                categorias.idsDoFiltro(parametros.categorias()));
        PaginaDeIds pagina = consulta.buscar(filtro, parametros.situacao(), parametros.ordem(), parametros.pagina(),
                parametros.tamanho());
        return new PaginaResponse<>(linhas(empresaId, pagina.ids(), categorias), parametros.pagina(),
                parametros.tamanho(), pagina.total());
    }

    /** Regra 24: o resumo usa busca, categoria e status, sem a situacao. */
    @Transactional(readOnly = true)
    public ResumoDaPosicaoResponse resumoParaUsuario(Long idUsuario, ParametrosDaPosicao parametros) {
        Long empresaId = resolvedor.resolver(idUsuario).empresaId();
        CategoriaArvore categorias = categoriaService.arvoreDaEmpresa(empresaId);
        return ResumoDaPosicaoResponse.de(consulta.resumir(filtro(empresaId, parametros.busca(), parametros.status(),
                categorias.idsDoFiltro(parametros.categorias()))));
    }

    /** Mesma montagem da busca da listagem de produtos, sem filtro de estoque nem promocao. */
    private FiltroDeProdutos filtro(Long empresaId, String busca, StatusFiltro status, Set<Long> categorias) {
        return new FiltroDeProdutos(empresaId, TextoDeBusca.palavras(busca), TextoDeBusca.termoDeCodigo(busca),
                TextoDeBusca.termoNumerico(busca), status, categorias, Set.of(), false, SituacaoPromocao.hoje(relogio));
    }

    /** Etapa 2: produtos, embalagens e saldos dos ids, na ordem dos ids (um id que sumiu fica fora). */
    private List<PosicaoDeEstoqueResponse> linhas(Long empresaId, List<Long> ids, CategoriaArvore categorias) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<Long, Produto> porId = produtoRepository.buscarComRelacoesPorIds(empresaId, ids).stream()
                .collect(Collectors.toMap(Produto::getId, Function.identity()));
        produtoRepository.carregarEmbalagens(empresaId, ids);
        Map<Long, BigDecimal> saldos = saldoRepository.saldos(empresaId, ids).stream()
                .collect(Collectors.toMap(SaldoPorProduto::produtoId, SaldoPorProduto::saldo));
        return ids.stream()
                .map(porId::get)
                .filter(Objects::nonNull)
                .map(produto -> PosicaoDeEstoqueResponse.de(produto,
                        saldos.getOrDefault(produto.getId(), BigDecimal.ZERO), categorias))
                .toList();
    }
}
