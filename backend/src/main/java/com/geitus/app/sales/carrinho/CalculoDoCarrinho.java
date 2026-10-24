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
        Map<Long, BigDecimal> saldos = produtosDoPdv.saldos(usuario.empresaId(), montado.produtoIds());
        CalculoConferido conferido = calcular(usuario, carrinho, montado, saldos);
        return CalculoResponse.de(conferido.calculo().comEstoque(conferido.estoque()));
    }

    /**
     * O calculo das regras do carrinho e, separada, a conferencia do estoque:
     * o {@code /calculo} junta as duas na resposta; a finalizacao responde 400
     * para as regras e 409 para o estoque.
     */
    public record CalculoConferido(CalculoDaVenda calculo, ConferenciaDoEstoque.Resultado estoque) {
    }

    /**
     * O calculo com a conferencia do estoque, o mesmo no {@code /calculo} e na
     * finalizacao (perfil do banco, regras do PDV da empresa e "hoje" do
     * relogio).
     *
     * @param saldos o saldo atual de cada produto (na finalizacao, ja travado)
     */
    public CalculoConferido calcular(UsuarioAutenticado usuario, CarrinhoRequest carrinho, CarrinhoMontado montado,
            Map<Long, BigDecimal> saldos) {
        RegrasDoPdv regras = configuracaoService.daEmpresa(usuario.empresaId());
        CalculoDaVenda calculo = CalculadoraDaVenda.calcular(montado.linhas(), carrinho.descontoDoTotal(),
                carrinho.pagamentosParaCalculo(), usuario.ehAdmin(), regras.descontoMaximoOperador(),
                SituacaoPromocao.hoje(relogio));
        return new CalculoConferido(calculo,
                ConferenciaDoEstoque.conferir(calculo.linhas(), saldos, regras.venderSemEstoque()));
    }
}
