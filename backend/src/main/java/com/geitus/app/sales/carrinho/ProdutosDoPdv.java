package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.geitus.app.catalog.PrecoAplicado;
import com.geitus.app.catalog.PrecoDaEmbalagem;
import com.geitus.app.catalog.PrecoDeVenda;
import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoEmbalagem;
import com.geitus.app.catalog.ResumoDeEstoque;
import com.geitus.app.catalog.SituacaoPromocao;
import com.geitus.app.catalog.UsoDoProdutoNoEstoque;
import com.geitus.app.catalog.dto.ImagemResponse;
import com.geitus.app.catalog.dto.ImagensDosProdutos;
import com.geitus.app.catalog.imagem.ImagensDoProduto;
import com.geitus.app.sales.dto.ProdutoDoPdvResponse;
import com.geitus.app.sales.dto.ProdutoDoPdvResponse.EmbalagemDoPdv;

/**
 * Monta o {@link ProdutoDoPdvResponse} de uma lista de produtos com tres
 * consultas a mais, qualquer que seja o tamanho (saldos e imagens em lote):
 * preco vigente sem atacado, preco efetivo das embalagens, saldo e miniatura.
 * Nunca o custo. Exige a transacao de quem chama.
 */
@Component
class ProdutosDoPdv {

    private final UsoDoProdutoNoEstoque usoNoEstoque;
    private final ImagensDoProduto imagens;
    private final Clock relogio;

    ProdutosDoPdv(UsoDoProdutoNoEstoque usoNoEstoque, ImagensDoProduto imagens, Clock relogio) {
        this.usoNoEstoque = usoNoEstoque;
        this.imagens = imagens;
        this.relogio = relogio;
    }

    List<ProdutoDoPdvResponse> respostas(Long empresaId, List<Produto> produtos) {
        if (produtos.isEmpty()) {
            return List.of();
        }
        List<Long> ids = produtos.stream().map(Produto::getId).toList();
        Map<Long, ResumoDeEstoque> estoques = usoNoEstoque.resumos(empresaId, ids);
        ImagensDosProdutos imagensDosProdutos = imagens.daPagina(empresaId, ids);
        LocalDate hoje = SituacaoPromocao.hoje(relogio);
        return produtos.stream()
                .map(produto -> resposta(produto, estoques.getOrDefault(produto.getId(), ResumoDeEstoque.VAZIO),
                        imagensDosProdutos.doProduto(produto.getId()), hoje))
                .toList();
    }

    /** O saldo atual de cada produto (0 sem movimento), sem trava: so para mostrar e avisar. */
    Map<Long, BigDecimal> saldos(Long empresaId, List<Long> produtoIds) {
        if (produtoIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, ResumoDeEstoque> resumos = usoNoEstoque.resumos(empresaId, produtoIds);
        return produtoIds.stream().distinct().collect(java.util.stream.Collectors.toMap(id -> id,
                id -> resumos.getOrDefault(id, ResumoDeEstoque.VAZIO).saldo()));
    }

    private static ProdutoDoPdvResponse resposta(Produto produto, ResumoDeEstoque estoque, ImagemResponse imagem,
            LocalDate hoje) {
        PrecoAplicado vigente = PrecoDeVenda.vigenteSemAtacado(produto, hoje);
        List<EmbalagemDoPdv> embalagens = produto.getEmbalagens().stream()
                .map(embalagem -> embalagem(embalagem, vigente))
                .toList();
        return new ProdutoDoPdvResponse(produto.getUuid(), produto.getCodigo(), produto.getNome(),
                produto.getUnidade().getSigla(), produto.getUnidade().isFracionada(), produto.isControlaEstoque(),
                estoque.saldo(), vigente.precoUnitario(), imagem == null ? null : imagem.miniaturaUrl(), embalagens);
    }

    private static EmbalagemDoPdv embalagem(ProdutoEmbalagem embalagem, PrecoAplicado vigenteDaUnidade) {
        BigDecimal preco = PrecoDaEmbalagem.calcular(embalagem.getPreco(), embalagem.getQuantidade(), vigenteDaUnidade)
                .preco();
        return new EmbalagemDoPdv(embalagem.getUuid(), embalagem.rotulo(), embalagem.getQuantidade(),
                embalagem.getUnidade().getSigla(), preco);
    }
}
