package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoEmbalagem;
import com.geitus.app.catalog.ProdutoRepository;
import com.geitus.app.catalog.balanca.ConfiguracaoEtiqueta;
import com.geitus.app.catalog.balanca.EtiquetaBalancaService;
import com.geitus.app.catalog.balanca.LeitorEtiquetaBalanca;
import com.geitus.app.catalog.balanca.LeituraEtiqueta;
import com.geitus.app.customer.Cliente;
import com.geitus.app.customer.ClienteRepository;
import com.geitus.app.iam.UsuarioAutenticado;
import com.geitus.app.sales.DadosDaVendaInvalidosException;
import com.geitus.app.sales.VendaConflitoException;
import com.geitus.app.sales.VendaNaoEncontradaException;
import com.geitus.app.sales.dto.CarrinhoRequest;
import com.geitus.app.sales.dto.ItemDoCarrinhoRequest;

/**
 * Resolve o carrinho do navegador na empresa do usuario (docs/modules/pdv.md,
 * 3.1, 3.5 e 7): carrega produtos, embalagens e cliente, le de novo cada
 * etiqueta com a configuracao da empresa e monta as {@link LinhaParaCalculo}.
 * E a mesma no {@code POST /api/pdv/calculo} e na finalizacao.
 *
 * <p>Nada do navegador vira preco ou valor: so os ids, a quantidade (fora da
 * etiqueta), o texto lido e o desconto informado, que a calculadora confere.
 * Produto, embalagem ou cliente de outra empresa responde como inexistente
 * (404 com o campo, DEC-016).
 */
@Component
public class MontagemDoCarrinho {

    public static final String CAMPO_CLIENTE = "clienteId";

    static final String MENSAGEM_PRODUTO_NAO_ENCONTRADO = "Produto não encontrado.";
    static final String MENSAGEM_PRODUTO_INATIVO = "Produto inativo — não pode ser vendido.";
    static final String MENSAGEM_EMBALAGEM_REMOVIDA = "A embalagem %s não existe mais.";
    static final String MENSAGEM_EMBALAGEM_REMOVIDA_SEM_ROTULO = "A embalagem deste item não existe mais.";
    static final String MENSAGEM_CODIGO_NAO_ENCONTRADO = "Código não encontrado.";
    static final String MENSAGEM_ETIQUETA_INVALIDA = "Esta etiqueta não está no formato da balança.";
    static final String MENSAGEM_CLIENTE_NAO_ENCONTRADO = "Cliente não encontrado.";

    private final ProdutoRepository produtoRepository;
    private final ClienteRepository clienteRepository;
    private final EtiquetaBalancaService etiquetaService;

    public MontagemDoCarrinho(ProdutoRepository produtoRepository, ClienteRepository clienteRepository,
            EtiquetaBalancaService etiquetaService) {
        this.produtoRepository = produtoRepository;
        this.clienteRepository = clienteRepository;
        this.etiquetaService = etiquetaService;
    }

    /** O cliente da venda, ativo e da empresa: o id interno e o nome na data (a fotografia da venda). */
    public record ClienteDaVenda(Long id, UUID uuid, String nome) {
    }

    /** As linhas resolvidas e o cliente ({@code null} sem cliente). */
    public record CarrinhoMontado(List<LinhaParaCalculo> linhas, ClienteDaVenda cliente) {

        /** Ids internos dos produtos das linhas, sem repeticao. */
        public List<Long> produtoIds() {
            return linhas.stream().map(linha -> linha.produto().getId()).distinct().toList();
        }
    }

    /**
     * Os ids internos dos produtos do carrinho que existem na empresa, sem
     * carregar as entidades: a finalizacao trava esses produtos antes de
     * {@link #montar} os ler (assim o calculo usa os dados ja travados).
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public List<Long> idsDosProdutos(UsuarioAutenticado usuario, CarrinhoRequest carrinho) {
        List<UUID> uuids = uuidsDosProdutos(carrinho);
        return uuids.isEmpty() ? List.of() : produtoRepository.idsPorUuids(usuario.empresaId(), uuids);
    }

    /**
     * Linhas na ordem do carrinho. 404 ({@code itens[i]}) para produto ou
     * embalagem inexistente e etiqueta de outro produto; 409 ({@code itens[i]})
     * para produto inativo; 400 ({@code itens[i]}) para etiqueta fora do formato;
     * 404 ({@code clienteId}) para cliente inexistente ou inativo.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public CarrinhoMontado montar(UsuarioAutenticado usuario, CarrinhoRequest carrinho) {
        Long empresaId = usuario.empresaId();
        Map<UUID, Produto> produtos = produtos(empresaId, uuidsDosProdutos(carrinho));
        ConfiguracaoEtiqueta etiqueta = carrinho.itens().stream().anyMatch(ItemDoCarrinhoRequest::ehEtiqueta)
                ? etiquetaService.configuracaoDaEmpresa(empresaId)
                : null;
        List<LinhaParaCalculo> linhas = new ArrayList<>();
        for (int indice = 0; indice < carrinho.itens().size(); indice++) {
            linhas.add(linha(indice, carrinho.itens().get(indice), produtos, etiqueta));
        }
        return new CarrinhoMontado(linhas, cliente(empresaId, carrinho.clienteId()));
    }

    private LinhaParaCalculo linha(int indice, ItemDoCarrinhoRequest item, Map<UUID, Produto> produtos,
            ConfiguracaoEtiqueta configuracaoDaEtiqueta) {
        String campo = "itens[" + indice + "]";
        Produto produto = produtos.get(item.produtoId());
        if (produto == null) {
            throw new VendaNaoEncontradaException(MENSAGEM_PRODUTO_NAO_ENCONTRADO, campo);
        }
        if (!produto.isAtivo()) {
            throw new VendaConflitoException(MENSAGEM_PRODUTO_INATIVO, campo);
        }
        String codigoLido = textoOuNulo(item.codigoLido());
        if (item.ehEtiqueta()) {
            LeituraEtiqueta leitura = releituraDaEtiqueta(produto, codigoLido, configuracaoDaEtiqueta, campo);
            return new LinhaParaCalculo(indice + 1, produto, null, leitura, codigoLido, null, desconto(item));
        }
        ProdutoEmbalagem embalagem = item.embalagemId() == null ? null : embalagem(produto, item, campo);
        BigDecimal quantidade = item.quantidade();
        return new LinhaParaCalculo(indice + 1, produto, embalagem, null, codigoLido, quantidade, desconto(item));
    }

    /** A etiqueta lida de novo pelo servidor; o codigo dela precisa ser o do produto da linha. */
    private static LeituraEtiqueta releituraDaEtiqueta(Produto produto, String codigoLido,
            ConfiguracaoEtiqueta configuracao, String campo) {
        LeituraEtiqueta leitura = LeitorEtiquetaBalanca.ler(codigoLido, configuracao)
                .orElseThrow(() -> new DadosDaVendaInvalidosException(MENSAGEM_ETIQUETA_INVALIDA, campo));
        if (!Objects.equals(produto.getCodigo(), leitura.codigoProduto())) {
            throw new VendaNaoEncontradaException(MENSAGEM_CODIGO_NAO_ENCONTRADO, campo);
        }
        return leitura;
    }

    private static ProdutoEmbalagem embalagem(Produto produto, ItemDoCarrinhoRequest item, String campo) {
        return produto.embalagem(item.embalagemId()).orElseThrow(() -> {
            String rotulo = textoOuNulo(item.embalagemRotulo());
            return new VendaNaoEncontradaException(rotulo == null
                    ? MENSAGEM_EMBALAGEM_REMOVIDA_SEM_ROTULO
                    : MENSAGEM_EMBALAGEM_REMOVIDA.formatted(rotulo), campo);
        });
    }

    private static DescontoInformado desconto(ItemDoCarrinhoRequest item) {
        return item.desconto() == null ? null : item.desconto().paraCalculo();
    }

    private ClienteDaVenda cliente(Long empresaId, UUID clienteId) {
        if (clienteId == null) {
            return null;
        }
        Cliente cliente = clienteRepository.findByUuidAndEmpresa_Id(clienteId, empresaId)
                .filter(Cliente::isAtivo)
                .orElseThrow(() -> new VendaNaoEncontradaException(MENSAGEM_CLIENTE_NAO_ENCONTRADO, CAMPO_CLIENTE));
        return new ClienteDaVenda(cliente.getId(), cliente.getUuid(), cliente.getNome());
    }

    private Map<UUID, Produto> produtos(Long empresaId, Collection<UUID> uuids) {
        if (uuids.isEmpty()) {
            return Map.of();
        }
        return produtoRepository.buscarParaVenda(empresaId, uuids).stream()
                .collect(Collectors.toMap(Produto::getUuid, Function.identity(), (primeiro, repetido) -> primeiro));
    }

    private static List<UUID> uuidsDosProdutos(CarrinhoRequest carrinho) {
        return carrinho.itens().stream().map(ItemDoCarrinhoRequest::produtoId).distinct().toList();
    }

    private static String textoOuNulo(String texto) {
        return texto == null || texto.isBlank() ? null : texto.strip();
    }
}
