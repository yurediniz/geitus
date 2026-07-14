package com.upeflow.erpell.product;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.upeflow.erpell.auth.CredenciaisInvalidasException;
import com.upeflow.erpell.company.Empresa;
import com.upeflow.erpell.company.EmpresaRepository;
import com.upeflow.erpell.user.Usuario;
import com.upeflow.erpell.user.UsuarioRepository;

/**
 * Regras de negocio do modulo Produtos.
 *
 * <p>Toda a regra de negocio fica concentrada aqui (arquitetura por camadas do
 * CLAUDE.md), consumida por um controller fino ({@code ProdutoController}).
 *
 * <p>O {@code empresaId} recebido pelos metodos internos representa SEMPRE a
 * empresa do usuario autenticado (nunca uma escolha livre do chamador) e e
 * usado para isolar consultas e alteracoes por tenant (DEC-016): um produto de
 * outra empresa nunca deve ser encontrado, atualizado ou vazado.
 *
 * <p>A API publica do service e composta apenas pelos metodos {@code *ParaUsuario},
 * que recebem {@code idUsuario} (o id extraido do JWT) e resolvem a empresa
 * internamente, no mesmo padrao usado em {@code EmpresaService.buscarUsuarioAtivo}:
 * assim o controller nunca manipula {@code empresaId} diretamente, evitando que
 * um cliente da API consiga informar/adivinhar uma empresa por parametro. Os
 * metodos que recebem {@code empresaId} sao de uso interno (package-private) e
 * concentram a regra de isolamento por tenant.
 */
@Service
public class ProdutoService {

    private final ProdutoRepository produtoRepository;
    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;

    public ProdutoService(ProdutoRepository produtoRepository, EmpresaRepository empresaRepository,
            UsuarioRepository usuarioRepository) {
        this.produtoRepository = produtoRepository;
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
    }

    Produto cadastrar(Long empresaId, String nome, String categoria, String unidade,
            BigDecimal precoVenda, BigDecimal custo, BigDecimal estoqueMinimo,
            String codigoBarras, String sku) {
        validarDadosBasicos(nome, precoVenda, custo, estoqueMinimo);
        String skuNormalizado = normalizarOuNulo(sku);
        String codigoBarrasNormalizado = normalizarOuNulo(codigoBarras);
        validarUnicidadeParaNovoProduto(empresaId, skuNormalizado, codigoBarrasNormalizado);

        Empresa empresa = empresaRepository.findById(empresaId)
                .orElseThrow(() -> new RegraDeNegocioException("Empresa informada não encontrada."));

        Produto produto = new Produto(empresa, nome.trim(), categoria, unidade, precoVenda, custo,
                estoqueMinimo, codigoBarrasNormalizado, skuNormalizado);

        return produtoRepository.save(produto);
    }

    Produto atualizarDadosBasicos(Long empresaId, Long produtoId, String nome, String categoria,
            String unidade, BigDecimal precoVenda, BigDecimal custo, BigDecimal estoqueMinimo,
            String codigoBarras, String sku) {
        Produto produto = buscarPorId(empresaId, produtoId);

        validarDadosBasicos(nome, precoVenda, custo, estoqueMinimo);
        String skuNormalizado = normalizarOuNulo(sku);
        String codigoBarrasNormalizado = normalizarOuNulo(codigoBarras);
        validarUnicidadeParaAtualizacao(empresaId, produtoId, skuNormalizado, codigoBarrasNormalizado);

        produto.atualizarDadosBasicos(nome.trim(), categoria, unidade, precoVenda, custo, estoqueMinimo,
                codigoBarrasNormalizado, skuNormalizado);

        return produtoRepository.save(produto);
    }

    Produto inativar(Long empresaId, Long produtoId) {
        Produto produto = buscarPorId(empresaId, produtoId);
        produto.inativar();
        return produtoRepository.save(produto);
    }

    Produto reativar(Long empresaId, Long produtoId) {
        Produto produto = buscarPorId(empresaId, produtoId);
        produto.ativar();
        return produtoRepository.save(produto);
    }

    Produto buscarPorId(Long empresaId, Long produtoId) {
        return produtoRepository.findByIdAndEmpresa_Id(produtoId, empresaId)
                .orElseThrow(ProdutoNaoEncontradoException::new);
    }

    List<Produto> listarPorEmpresaComFiltros(Long empresaId, String busca, Boolean ativo) {
        // Sem termo de busca, usa a query sem o parametro :busca — passar null
        // para dentro de LOWER(CONCAT(...)) falha no PostgreSQL (bytea).
        if (!StringUtils.hasText(busca)) {
            return produtoRepository.buscarPorEmpresa(empresaId, ativo);
        }
        return produtoRepository.buscarPorEmpresaComBusca(empresaId, busca.trim(), ativo);
    }

    /**
     * Resolve a empresa do usuario autenticado e delega ao cadastro. O
     * {@code idUsuario} vem sempre do JWT (nunca de parametro externo).
     */
    @Transactional
    public Produto cadastrarParaUsuario(Long idUsuario, String nome, String categoria, String unidade,
            BigDecimal precoVenda, BigDecimal custo, BigDecimal estoqueMinimo, String codigoBarras, String sku) {
        Long empresaId = resolverEmpresaId(idUsuario);
        return cadastrar(empresaId, nome, categoria, unidade, precoVenda, custo, estoqueMinimo, codigoBarras, sku);
    }

    @Transactional
    public Produto atualizarDadosBasicosParaUsuario(Long idUsuario, Long produtoId, String nome, String categoria,
            String unidade, BigDecimal precoVenda, BigDecimal custo, BigDecimal estoqueMinimo,
            String codigoBarras, String sku) {
        Long empresaId = resolverEmpresaId(idUsuario);
        return atualizarDadosBasicos(empresaId, produtoId, nome, categoria, unidade, precoVenda, custo,
                estoqueMinimo, codigoBarras, sku);
    }

    @Transactional
    public Produto inativarParaUsuario(Long idUsuario, Long produtoId) {
        return inativar(resolverEmpresaId(idUsuario), produtoId);
    }

    @Transactional
    public Produto reativarParaUsuario(Long idUsuario, Long produtoId) {
        return reativar(resolverEmpresaId(idUsuario), produtoId);
    }

    @Transactional(readOnly = true)
    public Produto buscarPorIdParaUsuario(Long idUsuario, Long produtoId) {
        return buscarPorId(resolverEmpresaId(idUsuario), produtoId);
    }

    @Transactional(readOnly = true)
    public List<Produto> listarParaUsuario(Long idUsuario, String busca, Boolean ativo) {
        Long empresaId = resolverEmpresaId(idUsuario);
        return listarPorEmpresaComFiltros(empresaId, busca, ativo);
    }

    private Long resolverEmpresaId(Long idUsuario) {
        Usuario usuario = usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
        return usuario.getEmpresaId();
    }

    /**
     * Normaliza string em branco/vazia para {@code null}. Evita que
     * {@code sku}/{@code codigoBarras} sejam persistidos como string vazia
     * {@code ""}: a constraint UNIQUE(empresa_id, coluna) do Postgres trata
     * multiplas strings vazias como conflitantes entre si (diferente de
     * NULL, que nunca conflita), o que geraria erro de integridade para
     * produtos sem SKU/codigo de barras informado.
     */
    private String normalizarOuNulo(String valor) {
        return StringUtils.hasText(valor) ? valor.trim() : null;
    }

    private void validarDadosBasicos(String nome, BigDecimal precoVenda, BigDecimal custo,
            BigDecimal estoqueMinimo) {
        if (!StringUtils.hasText(nome)) {
            throw new RegraDeNegocioException("Nome do produto é obrigatório.");
        }
        if (precoVenda == null) {
            throw new RegraDeNegocioException("Preço de venda é obrigatório.");
        }
        if (precoVenda.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Preço de venda não pode ser negativo.");
        }
        if (custo != null && custo.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Custo não pode ser negativo.");
        }
        if (estoqueMinimo != null && estoqueMinimo.compareTo(BigDecimal.ZERO) < 0) {
            throw new RegraDeNegocioException("Estoque mínimo não pode ser negativo.");
        }
    }

    private void validarUnicidadeParaNovoProduto(Long empresaId, String sku, String codigoBarras) {
        if (StringUtils.hasText(sku) && produtoRepository.existsBySkuAndEmpresa_Id(sku, empresaId)) {
            throw new RegraDeNegocioException("Já existe um produto com este SKU nesta empresa.");
        }
        if (StringUtils.hasText(codigoBarras)
                && produtoRepository.existsByCodigoBarrasAndEmpresa_Id(codigoBarras, empresaId)) {
            throw new RegraDeNegocioException("Já existe um produto com este código de barras nesta empresa.");
        }
    }

    private void validarUnicidadeParaAtualizacao(Long empresaId, Long produtoId, String sku, String codigoBarras) {
        if (StringUtils.hasText(sku)
                && produtoRepository.existsBySkuAndEmpresa_IdAndIdNot(sku, empresaId, produtoId)) {
            throw new RegraDeNegocioException("Já existe um produto com este SKU nesta empresa.");
        }
        if (StringUtils.hasText(codigoBarras)
                && produtoRepository.existsByCodigoBarrasAndEmpresa_IdAndIdNot(codigoBarras, empresaId, produtoId)) {
            throw new RegraDeNegocioException("Já existe um produto com este código de barras nesta empresa.");
        }
    }
}
