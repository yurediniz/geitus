package com.geitus.app.inventory;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.EntradaDeCompra;
import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.RegistroDeEstoqueInicial;
import com.geitus.app.catalog.ResumoDeEstoque;
import com.geitus.app.catalog.UsoDoProdutoNoEstoque;

/**
 * Implementacao, no estoque, das interfaces que o catalogo declara
 * ({@link UsoDoProdutoNoEstoque} e {@link RegistroDeEstoqueInicial};
 * docs/modules/estoque.md). Assim o catalogo nao
 * depende deste pacote: so este pacote depende do catalogo.
 *
 * <p>Os ids recebidos sao os internos, ja resolvidos dentro da empresa do
 * usuario pelo catalogo (DEC-016); toda consulta filtra tambem pela empresa.
 */
@Component
public class EstoqueDoCatalogo implements UsoDoProdutoNoEstoque, RegistroDeEstoqueInicial {

    private final EstoqueService estoqueService;
    private final EstoqueSaldoRepository saldoRepository;
    private final MovimentoEstoqueRepository movimentoRepository;

    public EstoqueDoCatalogo(EstoqueService estoqueService, EstoqueSaldoRepository saldoRepository,
            MovimentoEstoqueRepository movimentoRepository) {
        this.estoqueService = estoqueService;
        this.saldoRepository = saldoRepository;
        this.movimentoRepository = movimentoRepository;
    }

    /** Duas consultas (saldos e contagens), qualquer que seja o numero de produtos; nenhuma sem ids. */
    @Override
    @Transactional(readOnly = true)
    public Map<Long, ResumoDeEstoque> resumos(Long empresaId, Collection<Long> produtoIds) {
        if (produtoIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, BigDecimal> saldos = saldoRepository.saldos(empresaId, produtoIds).stream()
                .collect(Collectors.toMap(SaldoPorProduto::produtoId, SaldoPorProduto::saldo));
        Map<Long, ContagemDeMovimentos> contagens = movimentoRepository
                .contagens(empresaId, produtoIds, OrigemMovimento.CADASTRO).stream()
                .collect(Collectors.toMap(ContagemDeMovimentos::produtoId, Function.identity()));
        Map<Long, ResumoDeEstoque> resumos = new HashMap<>();
        for (Long produtoId : produtoIds) {
            resumos.put(produtoId, resumo(saldos.get(produtoId), contagens.get(produtoId)));
        }
        return resumos;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean algumProdutoDaUnidadeTemMovimentos(Long empresaId, Long unidadeId) {
        return movimentoRepository.existeMovimentoDeProdutoDaUnidade(empresaId, unidadeId);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<EntradaDeCompra> ultimaEntradaDeCompra(Long empresaId, Long produtoId) {
        return movimentoRepository.entradasDeCompraDoProduto(empresaId, produtoId, PageRequest.of(0, 1)).stream()
                .findFirst();
    }

    /** Uma consulta, qualquer que seja o tamanho da pagina; nenhuma sem ids. */
    @Override
    @Transactional(readOnly = true)
    public Map<Long, EntradaDeCompra> entradasDeCompra(Long empresaId, Collection<Long> movimentoIds) {
        if (movimentoIds.isEmpty()) {
            return Map.of();
        }
        return movimentoRepository.entradasDosMovimentos(empresaId, movimentoIds).stream()
                .collect(Collectors.toMap(EntradaDoMovimento::movimentoId, EntradaDoMovimento::entrada));
    }

    /** Na transacao do cadastro: se o produto nao for gravado, o estoque inicial tambem nao e. */
    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void registrar(Produto produto, BigDecimal quantidade, Long usuarioId) {
        estoqueService.registrarMovimento(produto, TipoMovimento.ENTRADA, MotivoMovimento.ESTOQUE_INICIAL,
                OrigemMovimento.CADASTRO, quantidade, null, usuarioId, null);
    }

    /**
     * Na transacao da exclusao, com o produto travado. Apaga so os movimentos de
     * origem {@code CADASTRO}: se outro movimento existir, a FK RESTRICT barra o
     * DELETE do produto logo depois (409 no catalogo).
     */
    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void removerParaExclusao(Long empresaId, Long produtoId) {
        movimentoRepository.apagarDoProdutoPelaOrigem(empresaId, produtoId, OrigemMovimento.CADASTRO);
        saldoRepository.apagarDoProduto(empresaId, produtoId);
    }

    /** Sem linha de saldo, o saldo e 0; sem contagem, o produto nunca movimentou. */
    private static ResumoDeEstoque resumo(BigDecimal saldo, ContagemDeMovimentos contagem) {
        BigDecimal saldoAtual = saldo == null ? BigDecimal.ZERO : saldo;
        if (contagem == null) {
            return new ResumoDeEstoque(saldoAtual, 0, 0);
        }
        return new ResumoDeEstoque(saldoAtual, contagem.total(), contagem.naoIniciais());
    }
}
