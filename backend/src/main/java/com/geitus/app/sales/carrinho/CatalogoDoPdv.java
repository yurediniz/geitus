package com.geitus.app.sales.carrinho;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoRepository;
import com.geitus.app.catalog.categoria.CategoriaArvore;
import com.geitus.app.catalog.categoria.CategoriaService;
import com.geitus.app.iam.ResolvedorDoUsuarioAutenticado;
import com.geitus.app.sales.DadosDaVendaInvalidosException;
import com.geitus.app.sales.dto.CatalogoDoPdvResponse;

/**
 * O catalogo do PDV antes de digitar (DEC-044): os produtos ativos da
 * empresa, os mais vendidos nos ultimos 30 dias primeiro (vendas concluidas,
 * contadas por venda e nao por quantidade, para KG e UN pesarem igual) e o
 * resto por nome. A categoria vale com as descendentes. Paginas de 24, com
 * uma linha a mais para saber se ha outra.
 */
@Service
public class CatalogoDoPdv {

    static final int TAMANHO_DA_PAGINA = 24;
    static final int DIAS_DOS_MAIS_VENDIDOS = 30;
    /** Teto da paginacao (24 x 400 = 9.600 produtos): protege o OFFSET de valores absurdos. */
    static final int ULTIMA_PAGINA = 400;
    static final String MENSAGEM_PAGINA_INVALIDA = "Página inválida.";

    private static final String IDS = """
            SELECT p.id
              FROM produtos p
              LEFT JOIN (SELECT iv.produto_id, count(DISTINCT iv.venda_id) AS vendas
                           FROM itens_venda iv
                           JOIN vendas v ON v.empresa_id = iv.empresa_id AND v.id = iv.venda_id
                          WHERE iv.empresa_id = :empresaId
                            AND v.status = 'CONCLUIDA'
                            AND v.concluida_em >= :desde
                          GROUP BY iv.produto_id) mv ON mv.produto_id = p.id
             WHERE p.empresa_id = :empresaId
               AND p.ativo""";
    private static final String CATEGORIAS = " AND p.categoria_id = ANY(:categoriaIds)";
    private static final String ORDEM_E_PAGINA =
            " ORDER BY COALESCE(mv.vendas, 0) DESC, p.nome_normalizado, p.id LIMIT :limite OFFSET :deslocamento";

    private final ResolvedorDoUsuarioAutenticado resolvedor;
    private final CategoriaService categoriaService;
    private final ProdutoRepository produtoRepository;
    private final ProdutosDoPdv produtosDoPdv;
    private final NamedParameterJdbcTemplate jdbc;
    private final Clock relogio;

    public CatalogoDoPdv(ResolvedorDoUsuarioAutenticado resolvedor, CategoriaService categoriaService,
            ProdutoRepository produtoRepository, ProdutosDoPdv produtosDoPdv, NamedParameterJdbcTemplate jdbc,
            Clock relogio) {
        this.resolvedor = resolvedor;
        this.categoriaService = categoriaService;
        this.produtoRepository = produtoRepository;
        this.produtosDoPdv = produtosDoPdv;
        this.jdbc = jdbc;
        this.relogio = relogio;
    }

    /**
     * A {@code pagina} (a partir de 0) do catalogo; {@code categoria} nula e
     * sem filtro. Categoria de outra empresa ou inexistente responde vazio,
     * sem revelar nada.
     */
    @Transactional(readOnly = true)
    public CatalogoDoPdvResponse listarParaUsuario(Long idUsuario, UUID categoria, int pagina) {
        if (pagina < 0 || pagina > ULTIMA_PAGINA) {
            throw new DadosDaVendaInvalidosException(MENSAGEM_PAGINA_INVALIDA, "pagina");
        }
        Long empresaId = resolvedor.resolver(idUsuario).empresaId();
        MapSqlParameterSource parametros = new MapSqlParameterSource()
                .addValue("empresaId", empresaId)
                .addValue("desde", OffsetDateTime.now(relogio).minusDays(DIAS_DOS_MAIS_VENDIDOS))
                .addValue("limite", TAMANHO_DA_PAGINA + 1)
                .addValue("deslocamento", pagina * TAMANHO_DA_PAGINA);
        String sql = IDS;
        if (categoria != null) {
            Set<Long> categorias = categoriasDoFiltro(categoriaService.arvoreDaEmpresa(empresaId), categoria);
            if (categorias.isEmpty()) {
                return new CatalogoDoPdvResponse(List.of(), false);
            }
            sql += CATEGORIAS;
            parametros.addValue("categoriaIds", categorias.toArray(Long[]::new));
        }
        List<Long> ids = jdbc.queryForList(sql + ORDEM_E_PAGINA, parametros, Long.class);
        boolean temMais = ids.size() > TAMANHO_DA_PAGINA;
        List<Long> daPagina = temMais ? ids.subList(0, TAMANHO_DA_PAGINA) : ids;
        return new CatalogoDoPdvResponse(produtosDoPdv.respostas(empresaId, naOrdem(empresaId, daPagina)), temMais);
    }

    private static Set<Long> categoriasDoFiltro(CategoriaArvore arvore, UUID categoria) {
        return arvore.buscarPeloUuid(categoria)
                .map(encontrada -> arvore.idsDaSubarvore(encontrada.getId()))
                .orElse(Set.of());
    }

    /** Os produtos dos ids, na ordem dos ids (um que sumiu entre as consultas fica de fora). */
    private List<Produto> naOrdem(Long empresaId, List<Long> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<Long, Produto> porId = produtoRepository.buscarParaVendaPorIds(empresaId, ids).stream()
                .collect(Collectors.toMap(Produto::getId, Function.identity(), (primeiro, repetido) -> primeiro));
        return ids.stream().map(porId::get).filter(Objects::nonNull).toList();
    }
}
