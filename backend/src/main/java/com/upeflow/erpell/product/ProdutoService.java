package com.upeflow.erpell.product;

import java.math.BigDecimal;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.upeflow.erpell.company.Empresa;
import com.upeflow.erpell.company.EmpresaRepository;

/**
 * Regras de negocio do modulo Produtos.
 *
 * <p>Base minima da Etapa 7B1: ainda sem controller/endpoint. Toda a regra de
 * negocio fica concentrada aqui (arquitetura por camadas do CLAUDE.md), pronta
 * para ser consumida por um controller fino quando ele for criado.
 *
 * <p>O {@code empresaId} recebido por todo metodo publico representa SEMPRE a
 * empresa do usuario autenticado (nunca uma escolha livre do chamador) e e
 * usado para isolar consultas e alteracoes por tenant (DEC-016): um produto de
 * outra empresa nunca deve ser encontrado, atualizado ou vazado.
 */
@Service
public class ProdutoService {

    private final ProdutoRepository produtoRepository;
    private final EmpresaRepository empresaRepository;

    public ProdutoService(ProdutoRepository produtoRepository, EmpresaRepository empresaRepository) {
        this.produtoRepository = produtoRepository;
        this.empresaRepository = empresaRepository;
    }

    @Transactional
    public Produto cadastrar(Long empresaId, String nome, String categoria, String unidade,
            BigDecimal precoVenda, BigDecimal custo, BigDecimal estoqueMinimo,
            String codigoBarras, String sku) {
        validarDadosBasicos(nome, precoVenda, custo, estoqueMinimo);
        String skuNormalizado = normalizarOuNulo(sku);
        String codigoBarrasNormalizado = normalizarOuNulo(codigoBarras);
        validarUnicidadeParaNovoProduto(empresaId, skuNormalizado, codigoBarrasNormalizado);

        Empresa empresa = empresaRepository.findById(empresaId)
                .orElseThrow(() -> new RegraDeNegocioException("Empresa informada não encontrada."));

        Produto produto = new Produto(empresa, nome.trim(), precoVenda);
        produto.atualizarDadosBasicos(nome.trim(), categoria, unidade, precoVenda, custo, estoqueMinimo,
                codigoBarrasNormalizado, skuNormalizado);

        return produtoRepository.save(produto);
    }

    @Transactional
    public Produto atualizarDadosBasicos(Long empresaId, Long produtoId, String nome, String categoria,
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

    @Transactional
    public Produto inativar(Long empresaId, Long produtoId) {
        Produto produto = buscarPorId(empresaId, produtoId);
        produto.inativar();
        return produtoRepository.save(produto);
    }

    @Transactional
    public Produto reativar(Long empresaId, Long produtoId) {
        Produto produto = buscarPorId(empresaId, produtoId);
        produto.ativar();
        return produtoRepository.save(produto);
    }

    @Transactional(readOnly = true)
    public Produto buscarPorId(Long empresaId, Long produtoId) {
        return produtoRepository.findByIdAndEmpresaId(produtoId, empresaId)
                .orElseThrow(ProdutoNaoEncontradoException::new);
    }

    @Transactional(readOnly = true)
    public List<Produto> listarPorEmpresa(Long empresaId) {
        return produtoRepository.findByEmpresaId(empresaId);
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
        if (StringUtils.hasText(sku) && produtoRepository.existsBySkuAndEmpresaId(sku, empresaId)) {
            throw new RegraDeNegocioException("Já existe um produto com este SKU nesta empresa.");
        }
        if (StringUtils.hasText(codigoBarras)
                && produtoRepository.existsByCodigoBarrasAndEmpresaId(codigoBarras, empresaId)) {
            throw new RegraDeNegocioException("Já existe um produto com este código de barras nesta empresa.");
        }
    }

    private void validarUnicidadeParaAtualizacao(Long empresaId, Long produtoId, String sku, String codigoBarras) {
        if (StringUtils.hasText(sku)
                && produtoRepository.existsBySkuAndEmpresaIdAndIdNot(sku, empresaId, produtoId)) {
            throw new RegraDeNegocioException("Já existe um produto com este SKU nesta empresa.");
        }
        if (StringUtils.hasText(codigoBarras)
                && produtoRepository.existsByCodigoBarrasAndEmpresaIdAndIdNot(codigoBarras, empresaId, produtoId)) {
            throw new RegraDeNegocioException("Já existe um produto com este código de barras nesta empresa.");
        }
    }
}
