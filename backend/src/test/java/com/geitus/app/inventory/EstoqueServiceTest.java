package com.geitus.app.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.PlatformTransactionManager;

import com.geitus.app.catalog.CatalogoNaoEncontradoException;
import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoConflitoException;
import com.geitus.app.catalog.ProdutoNaoEncontradoException;
import com.geitus.app.catalog.ProdutoRepository;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.company.Empresa;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.inventory.EstoqueService.ResultadoAjuste;
import com.geitus.app.inventory.dto.AjusteEstoqueRequest;

/**
 * Regras do ajuste manual de estoque (docs/modules/produtos-estoque.md, 4.2 a
 * 4.5): variacao por tipo, saldo nunca negativo, fracao conforme a unidade,
 * motivos por tipo, observacao obrigatoria em "Outro", produto sem controle e
 * idempotencia pela chave. A concorrencia real fica no {@code EstoqueServiceIT}.
 */
@ExtendWith(MockitoExtension.class)
class EstoqueServiceTest {

    private static final Long EMPRESA_ID = 1L;
    private static final Long ID_USUARIO = 9L;
    private static final Long PRODUTO_ID = 5L;

    @Mock
    private ProdutoRepository produtoRepository;

    @Mock
    private UsuarioRepository usuarioRepository;

    @Mock
    private EstoqueSaldoRepository saldoRepository;

    @Mock
    private MovimentoEstoqueRepository movimentoRepository;

    private EstoqueService estoqueService;

    private PlatformTransactionManager transacoes;

    private Empresa empresa;
    private UnidadeMedida un;
    private UnidadeMedida kg;

    @BeforeEach
    void setUp() {
        transacoes = mock(PlatformTransactionManager.class);
        estoqueService = new EstoqueService(produtoRepository, usuarioRepository, saldoRepository,
                movimentoRepository, transacoes);
        empresa = ProdutosDeTeste.empresa(EMPRESA_ID);
        un = ProdutosDeTeste.unidade(empresa, "UN", false);
        kg = ProdutosDeTeste.unidade(empresa, "KG", true);
        Usuario usuario = new Usuario(empresa, "Ana Souza", "ana@empresa.test", "hash", "ADMIN");
        ReflectionTestUtils.setField(usuario, "id", ID_USUARIO);
        lenient().when(usuarioRepository.findById(ID_USUARIO)).thenReturn(Optional.of(usuario));
        lenient().when(movimentoRepository.save(any(MovimentoEstoque.class)))
                .thenAnswer(invocacao -> invocacao.getArgument(0));
    }

    // ---------- Fixtures ----------

    private Produto produtoComSaldo(UnidadeMedida unidade, String saldo) {
        Produto produto = produtoEncontrado(ProdutosDeTeste.produto(empresa, unidade, PRODUTO_ID, true));
        EstoqueSaldo linha = ProdutosDeTeste.saldo(produto, saldo);
        lenient().when(saldoRepository.buscarParaAtualizar(EMPRESA_ID, PRODUTO_ID)).thenReturn(Optional.of(linha));
        return produto;
    }

    private Produto produtoEncontrado(Produto produto) {
        lenient().when(produtoRepository.buscarPorUuidParaAtualizar(produto.getUuid(), EMPRESA_ID))
                .thenReturn(Optional.of(produto));
        return produto;
    }

    private static AjusteEstoqueRequest ajuste(TipoMovimento tipo, String quantidade, MotivoMovimento motivo) {
        return ajuste(tipo, quantidade, motivo, null, UUID.randomUUID());
    }

    private static AjusteEstoqueRequest ajuste(TipoMovimento tipo, String quantidade, MotivoMovimento motivo,
            String observacao, UUID chave) {
        return new AjusteEstoqueRequest(tipo, new BigDecimal(quantidade), motivo, observacao, chave, null);
    }

    private ResultadoAjuste ajustar(Produto produto, AjusteEstoqueRequest request) {
        return estoqueService.ajustarParaUsuario(ID_USUARIO, produto.getUuid(), request);
    }

    private EstoqueSaldo saldoGravado() {
        return saldoRepository.buscarParaAtualizar(EMPRESA_ID, PRODUTO_ID).orElseThrow();
    }

    private void assertRegra(Runnable acao, String mensagem, String campo) {
        assertThatThrownBy(acao::run)
                .isInstanceOfSatisfying(RegraDeNegocioException.class,
                        erro -> assertThat(erro.campo()).isEqualTo(Optional.ofNullable(campo)))
                .hasMessage(mensagem);
        verify(movimentoRepository, never()).save(any());
    }

    // ---------- Variacao por tipo ----------

    @Test
    void entradaSomaAoSaldo() {
        Produto produto = produtoComSaldo(un, "10.000");

        ResultadoAjuste resultado = ajustar(produto, ajuste(TipoMovimento.ENTRADA, "5", MotivoMovimento.COMPRA));

        assertThat(resultado.criado()).isTrue();
        assertThat(resultado.movimento().quantidade()).isEqualByComparingTo("5");
        assertThat(resultado.movimento().saldoAnterior()).isEqualByComparingTo("10");
        assertThat(resultado.movimento().saldoNovo()).isEqualByComparingTo("15");
        assertThat(resultado.movimento().origem()).isEqualTo(OrigemMovimento.AJUSTE_MANUAL);
        assertThat(resultado.movimento().usuarioNome()).isEqualTo("Ana Souza");
        assertThat(saldoGravado().getSaldo()).isEqualByComparingTo("15");
    }

    @Test
    void entradaGravaOMovimentoComOUsuarioEAChaveDepoisDeTravarOSaldo() {
        Produto produto = produtoComSaldo(un, "0");
        UUID chave = UUID.randomUUID();

        ajustar(produto, ajuste(TipoMovimento.ENTRADA, "2", MotivoMovimento.COMPRA, "Nota 123", chave));

        InOrder ordem = inOrder(produtoRepository, saldoRepository, movimentoRepository);
        ordem.verify(produtoRepository).buscarPorUuidParaAtualizar(produto.getUuid(), EMPRESA_ID);
        ordem.verify(saldoRepository).garantirLinha(EMPRESA_ID, PRODUTO_ID);
        ordem.verify(saldoRepository).buscarParaAtualizar(EMPRESA_ID, PRODUTO_ID);
        ArgumentCaptor<MovimentoEstoque> gravado = ArgumentCaptor.forClass(MovimentoEstoque.class);
        ordem.verify(movimentoRepository).save(gravado.capture());
        assertThat(gravado.getValue().getUsuarioId()).isEqualTo(ID_USUARIO);
        assertThat(gravado.getValue().getEmpresaId()).isEqualTo(EMPRESA_ID);
        assertThat(gravado.getValue().getChaveIdempotencia()).isEqualTo(chave);
        assertThat(gravado.getValue().getObservacao()).isEqualTo("Nota 123");
        assertThat(gravado.getValue().getTipo()).isEqualTo(TipoMovimento.ENTRADA);
        assertThat(gravado.getValue().getMotivo()).isEqualTo(MotivoMovimento.COMPRA);
    }

    @Test
    void saidaSubtraiDoSaldo() {
        Produto produto = produtoComSaldo(un, "10");

        ResultadoAjuste resultado = ajustar(produto, ajuste(TipoMovimento.SAIDA, "4", MotivoMovimento.PERDA_AVARIA));

        assertThat(resultado.movimento().quantidade()).isEqualByComparingTo("-4");
        assertThat(resultado.movimento().saldoNovo()).isEqualByComparingTo("6");
        assertThat(saldoGravado().getSaldo()).isEqualByComparingTo("6");
    }

    @Test
    void saidaIgualAoSaldoZera() {
        Produto produto = produtoComSaldo(un, "3.000");

        ResultadoAjuste resultado = ajustar(produto, ajuste(TipoMovimento.SAIDA, "3", MotivoMovimento.VENCIDO));

        assertThat(resultado.movimento().saldoNovo()).isEqualByComparingTo("0");
        assertThat(saldoGravado().getSaldo()).isEqualByComparingTo("0");
    }

    @Test
    void saidaAcimaDoSaldo_400() {
        Produto emUn = produtoComSaldo(un, "3.000");

        assertRegra(() -> ajustar(emUn, ajuste(TipoMovimento.SAIDA, "4", MotivoMovimento.USO_INTERNO)),
                "Saldo insuficiente: há 3 UN.", "quantidade");
        assertThat(saldoGravado().getSaldo()).isEqualByComparingTo("3");
    }

    @Test
    void saidaUmMilesimoAcimaDoSaldoEmKG_400() {
        Produto emKg = produtoComSaldo(kg, "3.000");

        assertRegra(() -> ajustar(emKg, ajuste(TipoMovimento.SAIDA, "3.001", MotivoMovimento.PERDA_AVARIA)),
                "Saldo insuficiente: há 3 KG.", "quantidade");
    }

    @Test
    void ajusteParaCimaEParaBaixo() {
        Produto produto = produtoComSaldo(un, "10");

        ResultadoAjuste paraCima = ajustar(produto, ajuste(TipoMovimento.AJUSTE, "12", MotivoMovimento.CONTAGEM));
        assertThat(paraCima.movimento().quantidade()).isEqualByComparingTo("2");
        assertThat(paraCima.movimento().saldoAnterior()).isEqualByComparingTo("10");
        assertThat(paraCima.movimento().saldoNovo()).isEqualByComparingTo("12");

        ResultadoAjuste paraBaixo = ajustar(produto, ajuste(TipoMovimento.AJUSTE, "7", MotivoMovimento.CONTAGEM));
        assertThat(paraBaixo.movimento().quantidade()).isEqualByComparingTo("-5");
        assertThat(paraBaixo.movimento().saldoAnterior()).isEqualByComparingTo("12");
        assertThat(paraBaixo.movimento().saldoNovo()).isEqualByComparingTo("7");
        assertThat(saldoGravado().getSaldo()).isEqualByComparingTo("7");
    }

    @Test
    void ajusteParaZeroZeraOEstoque() {
        Produto produto = produtoComSaldo(un, "4");

        ResultadoAjuste resultado = ajustar(produto, ajuste(TipoMovimento.AJUSTE, "0", MotivoMovimento.CONTAGEM));

        assertThat(resultado.movimento().quantidade()).isEqualByComparingTo("-4");
        assertThat(resultado.movimento().saldoNovo()).isEqualByComparingTo("0");
    }

    @Test
    void ajusteParaOMesmoSaldo_400() {
        Produto produto = produtoComSaldo(un, "12.000");

        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.AJUSTE, "12", MotivoMovimento.CONTAGEM)),
                "O saldo já é 12 UN.", "quantidade");
    }

    @Test
    void mensagemComFracaoUsaVirgulaSemZerosADireita() {
        Produto produto = produtoComSaldo(kg, "2.500");

        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.AJUSTE, "2.5", MotivoMovimento.CONTAGEM)),
                "O saldo já é 2,5 KG.", "quantidade");
    }

    @Test
    void entradaQuePassaDoLimiteDoSaldo_400() {
        Produto produto = produtoComSaldo(un, "999999999");

        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.ENTRADA, "1", MotivoMovimento.COMPRA)),
                "O saldo não pode passar de 999.999.999,999.", "quantidade");
    }

    @Test
    void entradaAteOLimiteExatoEAceita() {
        Produto produto = produtoComSaldo(kg, "999999999.998");

        ResultadoAjuste resultado = ajustar(produto, ajuste(TipoMovimento.ENTRADA, "0.001", MotivoMovimento.COMPRA));

        assertThat(resultado.movimento().saldoNovo()).isEqualByComparingTo("999999999.999");
    }

    // ---------- Quantidade e unidade ----------

    @Test
    void fracaoEmUN_400() {
        Produto produto = produtoComSaldo(un, "10");

        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.ENTRADA, "2.5", MotivoMovimento.COMPRA)),
                "A unidade UN não aceita quantidade fracionada.", "quantidade");
        verify(saldoRepository, never()).garantirLinha(anyLong(), anyLong());
    }

    @Test
    void fracaoEmKG_ok() {
        Produto produto = produtoComSaldo(kg, "1");

        ResultadoAjuste resultado = ajustar(produto, ajuste(TipoMovimento.ENTRADA, "2.5", MotivoMovimento.COMPRA));

        assertThat(resultado.movimento().saldoNovo()).isEqualByComparingTo("3.5");
    }

    @Test
    void quantidadeZeroNaEntradaENaSaida_400() {
        Produto produto = produtoComSaldo(un, "10");

        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.ENTRADA, "0", MotivoMovimento.COMPRA)),
                "Informe uma quantidade maior que zero.", "quantidade");
        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.SAIDA, "0", MotivoMovimento.VENCIDO)),
                "Informe uma quantidade maior que zero.", "quantidade");
    }

    @Test
    void quantidadeNegativa_400() {
        Produto produto = produtoComSaldo(un, "10");

        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.AJUSTE, "-1", MotivoMovimento.CONTAGEM)),
                "A quantidade não pode ser negativa.", "quantidade");
    }

    @Test
    void quantidadeComMaisDeTresCasas_400() {
        Produto produto = produtoComSaldo(kg, "10");

        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.ENTRADA, "1.0001", MotivoMovimento.COMPRA)),
                "A quantidade deve ter no máximo 9 dígitos inteiros e 3 casas decimais.", "quantidade");
    }

    @Test
    void quantidadeComDezDigitosInteiros_400() {
        Produto produto = produtoComSaldo(un, "0");

        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.AJUSTE, "1000000000", MotivoMovimento.CONTAGEM)),
                "A quantidade deve ter no máximo 9 dígitos inteiros e 3 casas decimais.", "quantidade");
    }

    // ---------- Motivo e observacao ----------

    @Test
    void motivoDeOutroTipo_400() {
        Produto produto = produtoComSaldo(un, "10");

        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.ENTRADA, "1", MotivoMovimento.PERDA_AVARIA)),
                "Este motivo não vale para o tipo de movimento escolhido.", "motivo");
        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.AJUSTE, "1", MotivoMovimento.COMPRA)),
                "Este motivo não vale para o tipo de movimento escolhido.", "motivo");
    }

    @Test
    void motivoEstoqueInicialManual_400() {
        Produto produto = produtoComSaldo(un, "10");

        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.ENTRADA, "1", MotivoMovimento.ESTOQUE_INICIAL)),
                "Este motivo é registrado só pelo sistema.", "motivo");
        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.SAIDA, "1", MotivoMovimento.VENDA)),
                "Este motivo é registrado só pelo sistema.", "motivo");
    }

    @Test
    void outroSemObservacao_400() {
        Produto produto = produtoComSaldo(un, "10");

        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.SAIDA, "1", MotivoMovimento.OUTRO, "   ",
                UUID.randomUUID())), "Descreva o motivo.", "observacao");
        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.ENTRADA, "1", MotivoMovimento.OUTRO)),
                "Descreva o motivo.", "observacao");
    }

    @Test
    void observacaoAparadaEVaziaViraNula() {
        Produto produto = produtoComSaldo(un, "10");

        ResultadoAjuste comTexto = ajustar(produto, ajuste(TipoMovimento.SAIDA, "1", MotivoMovimento.OUTRO,
                "  Brinde na feira  ", UUID.randomUUID()));
        ResultadoAjuste vazia = ajustar(produto, ajuste(TipoMovimento.ENTRADA, "1", MotivoMovimento.COMPRA, "   ",
                UUID.randomUUID()));

        assertThat(comTexto.movimento().observacao()).isEqualTo("Brinde na feira");
        assertThat(vazia.movimento().observacao()).isNull();
    }

    // ---------- Produto ----------

    @Test
    void produtoSemControle_400() {
        Produto produto = produtoEncontrado(ProdutosDeTeste.produto(empresa, un, PRODUTO_ID, false));

        assertRegra(() -> ajustar(produto, ajuste(TipoMovimento.ENTRADA, "1", MotivoMovimento.COMPRA)),
                "Este produto não controla estoque.", null);
        verify(saldoRepository, never()).garantirLinha(anyLong(), anyLong());
    }

    @Test
    void produtoDeOutraEmpresa_404() {
        UUID deOutraEmpresa = UUID.randomUUID();
        when(produtoRepository.buscarPorUuidParaAtualizar(deOutraEmpresa, EMPRESA_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> estoqueService.ajustarParaUsuario(ID_USUARIO, deOutraEmpresa,
                ajuste(TipoMovimento.ENTRADA, "1", MotivoMovimento.COMPRA)))
                .isInstanceOf(ProdutoNaoEncontradoException.class);
        verify(movimentoRepository, never()).save(any());
    }

    // ---------- Em embalagens (Fase B3, docs/modules/produtos-embalagens.md, 6) ----------

    private static AjusteEstoqueRequest emEmbalagens(TipoMovimento tipo, String quantidade, MotivoMovimento motivo,
            UUID embalagemId) {
        return new AjusteEstoqueRequest(tipo, new BigDecimal(quantidade), motivo, null, UUID.randomUUID(),
                embalagemId);
    }

    /** A contagem e sempre na unidade de venda: o tipo e conferido antes de procurar a embalagem. */
    @Test
    void contagemEmEmbalagem_400() {
        Produto produto = produtoComSaldo(un, "10");

        assertRegra(() -> ajustar(produto, emEmbalagens(TipoMovimento.AJUSTE, "2", MotivoMovimento.CONTAGEM,
                UUID.randomUUID())), "A contagem é feita na unidade de venda.", "embalagemId");
    }

    @Test
    void embalagemQueNaoEDoProduto_404() {
        Produto produto = produtoComSaldo(un, "10");

        assertThatThrownBy(() -> ajustar(produto, emEmbalagens(TipoMovimento.ENTRADA, "2", MotivoMovimento.COMPRA,
                UUID.randomUUID())))
                .isInstanceOf(CatalogoNaoEncontradoException.class)
                .hasMessage("Embalagem não encontrada.");
        verify(movimentoRepository, never()).save(any());
    }

    /**
     * Review Focus 5: a chave repetida devolve o movimento gravado ANTES de
     * procurar a embalagem, mesmo que ela ja nao exista no produto.
     */
    @Test
    void chaveRepetidaEmEmbalagemDevolveOGravadoSemProcurarAEmbalagem() {
        Produto produto = produtoComSaldo(un, "46");
        UUID chave = UUID.randomUUID();
        MovimentoEstoque gravado = new MovimentoEstoque(produto, TipoMovimento.ENTRADA, MotivoMovimento.COMPRA,
                OrigemMovimento.AJUSTE_MANUAL, new BigDecimal("36.000"), new BigDecimal("10.000"),
                new BigDecimal("46.000"), null, ID_USUARIO, chave,
                new RetratoDaEmbalagem("CX c/ 18 UN", new BigDecimal("18.000"), 2));
        when(movimentoRepository.findByEmpresaIdAndChaveIdempotencia(EMPRESA_ID, chave))
                .thenReturn(Optional.of(gravado));

        ResultadoAjuste resultado = ajustar(produto, new AjusteEstoqueRequest(TipoMovimento.ENTRADA,
                new BigDecimal("2"), MotivoMovimento.COMPRA, null, chave, UUID.randomUUID()));

        assertThat(resultado.criado()).isFalse();
        assertThat(resultado.movimento().embalagem().rotulo()).isEqualTo("CX c/ 18 UN");
        assertThat(resultado.movimento().embalagem().quantidadeDeEmbalagens()).isEqualTo(2);
        verify(movimentoRepository, never()).save(any());
    }

    /** A mesma chave com outra quantidade de embalagens, ou sem a embalagem, e outro pedido: 409. */
    @Test
    void chaveRepetidaComOutroPedidoDeEmbalagem_409() {
        Produto produto = produtoComSaldo(un, "46");
        UUID chave = UUID.randomUUID();
        MovimentoEstoque gravado = new MovimentoEstoque(produto, TipoMovimento.ENTRADA, MotivoMovimento.COMPRA,
                OrigemMovimento.AJUSTE_MANUAL, new BigDecimal("36.000"), new BigDecimal("10.000"),
                new BigDecimal("46.000"), null, ID_USUARIO, chave,
                new RetratoDaEmbalagem("CX c/ 18 UN", new BigDecimal("18.000"), 2));
        when(movimentoRepository.findByEmpresaIdAndChaveIdempotencia(EMPRESA_ID, chave))
                .thenReturn(Optional.of(gravado));

        assertThatThrownBy(() -> ajustar(produto, new AjusteEstoqueRequest(TipoMovimento.ENTRADA,
                new BigDecimal("3"), MotivoMovimento.COMPRA, null, chave, UUID.randomUUID())))
                .isInstanceOf(ProdutoConflitoException.class);
        assertThatThrownBy(() -> ajustar(produto, new AjusteEstoqueRequest(TipoMovimento.ENTRADA,
                new BigDecimal("36"), MotivoMovimento.COMPRA, null, chave, null)))
                .isInstanceOf(ProdutoConflitoException.class);
    }

    // ---------- Idempotencia (spec 4.5) ----------

    private MovimentoEstoque movimentoJaGravado(Produto produto, UUID chave) {
        MovimentoEstoque gravado = new MovimentoEstoque(produto, TipoMovimento.SAIDA, MotivoMovimento.PERDA_AVARIA,
                OrigemMovimento.AJUSTE_MANUAL, new BigDecimal("-2.000"), new BigDecimal("12.000"),
                new BigDecimal("10.000"), "Caixa amassada", ID_USUARIO, chave);
        when(movimentoRepository.findByEmpresaIdAndChaveIdempotencia(EMPRESA_ID, chave))
                .thenReturn(Optional.of(gravado));
        return gravado;
    }

    @Test
    void chaveRepetidaMesmosDados_devolveOExistenteSemGravar() {
        Produto produto = produtoComSaldo(un, "10");
        UUID chave = UUID.randomUUID();
        movimentoJaGravado(produto, chave);

        ResultadoAjuste resultado = ajustar(produto,
                ajuste(TipoMovimento.SAIDA, "2", MotivoMovimento.PERDA_AVARIA, "Caixa amassada", chave));

        assertThat(resultado.criado()).isFalse();
        assertThat(resultado.movimento().saldoNovo()).isEqualByComparingTo("10");
        assertThat(resultado.movimento().usuarioNome()).isEqualTo("Ana Souza");
        verify(movimentoRepository, never()).save(any());
        verify(saldoRepository, never()).garantirLinha(anyLong(), anyLong());
    }

    @Test
    void chaveRepetidaNoAjusteComparaOSaldoContado() {
        Produto produto = produtoComSaldo(un, "7");
        UUID chave = UUID.randomUUID();
        MovimentoEstoque gravado = new MovimentoEstoque(produto, TipoMovimento.AJUSTE, MotivoMovimento.CONTAGEM,
                OrigemMovimento.AJUSTE_MANUAL, new BigDecimal("-3"), new BigDecimal("10"), new BigDecimal("7"),
                null, ID_USUARIO, chave);
        when(movimentoRepository.findByEmpresaIdAndChaveIdempotencia(EMPRESA_ID, chave))
                .thenReturn(Optional.of(gravado));

        ResultadoAjuste resultado = ajustar(produto,
                ajuste(TipoMovimento.AJUSTE, "7.000", MotivoMovimento.CONTAGEM, null, chave));

        assertThat(resultado.criado()).isFalse();
    }

    @Test
    void chaveRepetidaOutrosDados_409() {
        Produto produto = produtoComSaldo(un, "10");
        UUID chave = UUID.randomUUID();
        movimentoJaGravado(produto, chave);
        String mensagem = "Esta operação já foi registrada com outros dados.";

        assertThatThrownBy(() -> ajustar(produto, ajuste(TipoMovimento.SAIDA, "3", MotivoMovimento.PERDA_AVARIA,
                null, chave))).isInstanceOf(ProdutoConflitoException.class).hasMessage(mensagem);
        assertThatThrownBy(() -> ajustar(produto, ajuste(TipoMovimento.SAIDA, "2", MotivoMovimento.VENCIDO,
                null, chave))).isInstanceOf(ProdutoConflitoException.class).hasMessage(mensagem);
        assertThatThrownBy(() -> ajustar(produto, ajuste(TipoMovimento.ENTRADA, "2", MotivoMovimento.COMPRA,
                null, chave))).isInstanceOf(ProdutoConflitoException.class).hasMessage(mensagem);
        verify(movimentoRepository, never()).save(any());
    }

    @Test
    void chaveRepetidaEmOutroProduto_409() {
        Produto outro = ProdutosDeTeste.produto(empresa, un, 77L, true);
        UUID chave = UUID.randomUUID();
        movimentoJaGravado(outro, chave);
        Produto produto = produtoComSaldo(un, "10");

        assertThatThrownBy(() -> ajustar(produto, ajuste(TipoMovimento.SAIDA, "2", MotivoMovimento.PERDA_AVARIA,
                null, chave)))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Esta operação já foi registrada com outros dados.");
    }

    @Test
    void chaveRepetidaComOutraObservacao_409() {
        Produto produto = produtoComSaldo(un, "10");
        UUID chave = UUID.randomUUID();
        movimentoJaGravado(produto, chave);

        assertThatThrownBy(() -> ajustar(produto, ajuste(TipoMovimento.SAIDA, "2", MotivoMovimento.PERDA_AVARIA,
                "Caixa molhada", chave)))
                .isInstanceOf(ProdutoConflitoException.class)
                .hasMessage("Esta operação já foi registrada com outros dados.");
    }

    @Test
    void chaveRepetidaComAMesmaObservacaoComEspacosEOMesmoPedido() {
        Produto produto = produtoComSaldo(un, "10");
        UUID chave = UUID.randomUUID();
        movimentoJaGravado(produto, chave);

        ResultadoAjuste resultado = ajustar(produto, ajuste(TipoMovimento.SAIDA, "2", MotivoMovimento.PERDA_AVARIA,
                "  Caixa amassada ", chave));

        assertThat(resultado.criado()).isFalse();
    }

    /** Violacao de outra constraint nao e tratada como repeticao: sobe como veio, sem segunda transacao. */
    @Test
    void violacaoQueNaoEDaChaveERelancadaSemSegundaTransacao() {
        Produto produto = produtoComSaldo(un, "10");
        DataIntegrityViolationException violacao = new DataIntegrityViolationException(
                "new row for relation estoque_saldos violates check constraint ck_estoque_saldo_nao_negativo");
        when(movimentoRepository.save(any(MovimentoEstoque.class))).thenThrow(violacao);

        assertThatThrownBy(() -> ajustar(produto, ajuste(TipoMovimento.ENTRADA, "1", MotivoMovimento.COMPRA)))
                .isSameAs(violacao);
        verify(transacoes, times(1)).getTransaction(any(TransactionDefinition.class));
    }

    /** Violacao da chave (corrida em outro produto): uma nova transacao le o movimento que ganhou. */
    @Test
    void violacaoDaChaveReleOMovimentoNumaNovaTransacao() {
        Produto produto = produtoComSaldo(un, "10");
        UUID chave = UUID.randomUUID();
        MovimentoEstoque vencedor = new MovimentoEstoque(produto, TipoMovimento.ENTRADA, MotivoMovimento.COMPRA,
                OrigemMovimento.AJUSTE_MANUAL, new BigDecimal("1.000"), new BigDecimal("10.000"),
                new BigDecimal("11.000"), null, ID_USUARIO, chave);
        when(movimentoRepository.findByEmpresaIdAndChaveIdempotencia(EMPRESA_ID, chave))
                .thenReturn(Optional.empty(), Optional.empty(), Optional.of(vencedor));
        when(movimentoRepository.save(any(MovimentoEstoque.class))).thenThrow(new DataIntegrityViolationException(
                "duplicate key value violates unique constraint uq_movimento_estoque_chave"));

        ResultadoAjuste resultado = ajustar(produto, ajuste(TipoMovimento.ENTRADA, "1", MotivoMovimento.COMPRA,
                null, chave));

        assertThat(resultado.criado()).isFalse();
        assertThat(resultado.movimento().saldoNovo()).isEqualByComparingTo("11");
        verify(transacoes, times(2)).getTransaction(any(TransactionDefinition.class));
    }

    // ---------- Consulta de movimentos ----------

    @Test
    void movimentosComPaginacaoInvalida_400() {
        assertThatThrownBy(() -> estoqueService.movimentosParaUsuario(ID_USUARIO, UUID.randomUUID(), 0, 101))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("O tamanho da página deve ser entre 1 e 100.");
        assertThatThrownBy(() -> estoqueService.movimentosParaUsuario(ID_USUARIO, UUID.randomUUID(), -1, 20))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A página deve ser maior ou igual a zero.");
    }
}
