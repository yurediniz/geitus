package com.geitus.app.sales.carrinho;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.catalog.SituacaoPromocao;
import com.geitus.app.iam.ResolvedorDoUsuarioAutenticado;
import com.geitus.app.iam.UsuarioAutenticado;
import com.geitus.app.sales.carrinho.MontagemDoCarrinho.CarrinhoMontado;
import com.geitus.app.sales.configuracao.ConfiguracaoDoPdvService;
import com.geitus.app.sales.configuracao.RegrasDoPdv;
import com.geitus.app.sales.dto.CalculoResponse;
import com.geitus.app.sales.dto.CarrinhoRequest;

/**
 * O {@code POST /api/pdv/calculo} (docs/modules/pdv.md, 5.2 e 5.3): monta o
 * carrinho na empresa do usuario, calcula com o perfil do banco (o limite de
 * desconto e so do OPERADOR) e as regras do PDV, e confere o estoque com o
 * saldo atual (sem trava: a trava e da finalizacao). Regras violadas voltam em
 * {@code erros} (200); dados inexistentes ou inativos, 404/409.
 */
@Service
public class CalculoDoCarrinho {

    private final ResolvedorDoUsuarioAutenticado resolvedor;
    private final MontagemDoCarrinho montagem;
    private final ConfiguracaoDoPdvService configuracaoService;
    private final ProdutosDoPdv produtosDoPdv;
    private final Clock relogio;

    public CalculoDoCarrinho(ResolvedorDoUsuarioAutenticado resolvedor, MontagemDoCarrinho montagem,
            ConfiguracaoDoPdvService configuracaoService, ProdutosDoPdv produtosDoPdv, Clock relogio) {
        this.resolvedor = resolvedor;
        this.montagem = montagem;
        this.configuracaoService = configuracaoService;
        this.produtosDoPdv = produtosDoPdv;
        this.relogio = relogio;
    }

    @Transactional(readOnly = true)
    public CalculoResponse calcularParaUsuario(Long idUsuario, CarrinhoRequest carrinho) {
        UsuarioAutenticado usuario = resolvedor.resolver(idUsuario);
        CarrinhoMontado montado = montagem.montar(usuario, carrinho);
        RegrasDoPdv regras = configuracaoService.daEmpresa(usuario.empresaId());
        Map<Long, BigDecimal> saldos = produtosDoPdv.saldos(usuario.empresaId(), montado.produtoIds());
        return CalculoResponse.de(calcular(usuario, carrinho, montado, regras, saldos));
    }

    /** O calculo com a conferencia do estoque, igual no {@code /calculo} e na finalizacao. */
    public CalculoDaVenda calcular(UsuarioAutenticado usuario, CarrinhoRequest carrinho, CarrinhoMontado montado,
            RegrasDoPdv regras, Map<Long, BigDecimal> saldos) {
        CalculoDaVenda calculo = CalculadoraDaVenda.calcular(montado.linhas(), carrinho.descontoDoTotal(),
                carrinho.pagamentosParaCalculo(), usuario.ehAdmin(), regras.descontoMaximoOperador(),
                SituacaoPromocao.hoje(relogio));
        return calculo.comEstoque(ConferenciaDoEstoque.conferir(calculo.linhas(), saldos, regras.venderSemEstoque()));
    }
}
