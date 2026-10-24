package com.geitus.app.catalog.marca;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.catalog.CatalogoConflitoException;
import com.geitus.app.catalog.CatalogoNaoEncontradoException;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.marca.dto.MarcaRequest;
import com.geitus.app.catalog.marca.dto.MarcaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Testa as regras do {@link MarcaService}, as mesmas das categorias com os
 * textos de marca (docs/modules/fornecedores-e-marcas.md, 3.1;
 * categorias-e-unidades.md, 4.2): isolamento por empresa (DEC-016), nome unico
 * entre irmaos sem diferenciar maiusculas, bloqueio de ciclos ao mover,
 * bloqueio de exclusao com submarcas, produtos ou fornecedores (mensagens
 * fixas), inativacao sem cascata e o recalculo da busca dos produtos ao
 * renomear.
 */
@ExtendWith(MockitoExtension.class)
class MarcaServiceTest {

    private static final Long ID_USUARIO = 1L;
    private static final Long ID_EMPRESA = 7L;
    private static final Long ID_OUTRA_EMPRESA = 8L;
    private static final String MENSAGEM_CICLO =
            "Uma marca não pode ficar dentro dela mesma ou de uma submarca sua.";
    private static final String MENSAGEM_NOME_REPETIDO = "Já existe uma marca com este nome neste nível.";

    @Mock
    private MarcaRepository marcaRepository;

    @Mock
    private EmpresaRepository empresaRepository;

    @Mock
    private UsuarioRepository usuarioRepository;

    @Mock
    private BuscaDosProdutosDaMarca buscaDosProdutos;

    @InjectMocks
    private MarcaService marcaService;

    private final AtomicLong proximoId = new AtomicLong(1);
    private final List<Marca> daEmpresa = new ArrayList<>();
    private Empresa empresa;

    @BeforeEach
    void usuarioAtivoDaEmpresa() {
        empresa = empresaComId(ID_EMPRESA);
        Usuario usuario = new Usuario(empresa, "Admin", "admin@geitus.com", "hash", "ADMIN");
        lenient().when(usuarioRepository.findById(ID_USUARIO)).thenReturn(Optional.of(usuario));
        lenient().when(marcaRepository.findByEmpresa_Id(ID_EMPRESA)).thenReturn(daEmpresa);
        lenient().when(empresaRepository.findById(ID_EMPRESA)).thenReturn(Optional.of(empresa));
        lenient().when(empresaRepository.travarPorId(ID_EMPRESA)).thenReturn(Optional.of(empresa));
        lenient().when(marcaRepository.save(any(Marca.class))).thenAnswer(invocacao -> {
            Marca salva = invocacao.getArgument(0);
            if (salva.getId() == null) {
                ReflectionTestUtils.setField(salva, "id", proximoId.getAndIncrement());
            }
            return salva;
        });
    }

    private static Empresa empresaComId(Long id) {
        Empresa empresa = new Empresa("Empresa " + id);
        ReflectionTestUtils.setField(empresa, "id", id);
        return empresa;
    }

    private Marca existente(Marca pai, String nome) {
        Marca marca = new Marca(empresa, pai, nome);
        ReflectionTestUtils.setField(marca, "id", proximoId.getAndIncrement());
        daEmpresa.add(marca);
        lenient().when(marcaRepository.findByUuidAndEmpresa_Id(marca.getUuid(), ID_EMPRESA))
                .thenReturn(Optional.of(marca));
        return marca;
    }

    // ---------- Cadastro ----------

    @Test
    void cadastrarNaRaizDevolveCaminhoENivel() {
        MarcaResponse resposta = marcaService.cadastrarParaUsuario(ID_USUARIO,
                new MarcaRequest("  Bebidas  ", null));

        assertThat(resposta.nome()).isEqualTo("Bebidas");
        assertThat(resposta.parentId()).isNull();
        assertThat(resposta.caminho()).isEqualTo("Bebidas");
        assertThat(resposta.nivel()).isZero();
        assertThat(resposta.selecionavel()).isTrue();
    }

    @Test
    void cadastrarComPaiMontaCaminhoCompleto() {
        Marca racao = existente(null, "Ração");
        Marca umida = existente(racao, "Úmida");

        MarcaResponse resposta = marcaService.cadastrarParaUsuario(ID_USUARIO,
                new MarcaRequest("Sachê", umida.getUuid()));

        assertThat(resposta.caminho()).isEqualTo("Ração › Úmida › Sachê");
        assertThat(resposta.nivel()).isEqualTo(2);
        assertThat(resposta.parentId()).isEqualTo(umida.getUuid());
    }

    @Test
    void criarComPaiDeOutraEmpresaLanca404() {
        // O pai existe, mas em outra empresa: nao aparece na lista desta empresa.
        Marca daOutraEmpresa = new Marca(empresaComId(ID_OUTRA_EMPRESA), null, "Ração");

        assertThatThrownBy(() -> marcaService.cadastrarParaUsuario(ID_USUARIO,
                new MarcaRequest("Úmida", daOutraEmpresa.getUuid())))
                .isInstanceOf(CatalogoNaoEncontradoException.class);
        verify(marcaRepository, never()).save(any());
    }

    @Test
    void nomeRepetidoEntreIrmaosLanca409() {
        Marca racao = existente(null, "Ração");
        existente(racao, "Úmida");

        assertThatThrownBy(() -> marcaService.cadastrarParaUsuario(ID_USUARIO,
                new MarcaRequest(" ÚMIDA ", racao.getUuid())))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage(MENSAGEM_NOME_REPETIDO);
        verify(marcaRepository, never()).save(any());
    }

    @Test
    void nomeRepetidoNaRaizLanca409() {
        existente(null, "Bebidas");

        assertThatThrownBy(() -> marcaService.cadastrarParaUsuario(ID_USUARIO,
                new MarcaRequest("bebidas", null)))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage(MENSAGEM_NOME_REPETIDO);
    }

    @Test
    void mesmoNomeEmPaisDiferentesEPermitido() {
        Marca racao = existente(null, "Ração");
        Marca umida = existente(racao, "Úmida");
        Marca seca = existente(racao, "Seca");
        existente(umida, "Sachê");

        MarcaResponse resposta = marcaService.cadastrarParaUsuario(ID_USUARIO,
                new MarcaRequest("Sachê", seca.getUuid()));

        assertThat(resposta.caminho()).isEqualTo("Ração › Seca › Sachê");
    }

    // ---------- Edicao (renomear e mover) ----------

    @Test
    void moverParaNetoLanca400ComMensagemFixa() {
        Marca racao = existente(null, "Ração");
        Marca umida = existente(racao, "Úmida");
        Marca sache = existente(umida, "Sachê");

        assertThatThrownBy(() -> marcaService.atualizarParaUsuario(ID_USUARIO, racao.getUuid(),
                new MarcaRequest("Ração", sache.getUuid())))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage(MENSAGEM_CICLO);
        assertThat(racao.getPai()).isNull();
        verify(marcaRepository, never()).save(any());
    }

    @Test
    void moverParaSiMesmaLanca400() {
        Marca racao = existente(null, "Ração");

        assertThatThrownBy(() -> marcaService.atualizarParaUsuario(ID_USUARIO, racao.getUuid(),
                new MarcaRequest("Ração", racao.getUuid())))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage(MENSAGEM_CICLO);
    }

    @Test
    void moverParaRaizComNomeJaExistenteNaRaizLanca409() {
        existente(null, "Úmida");
        Marca racao = existente(null, "Ração");
        Marca umidaDaRacao = existente(racao, "úmida");

        assertThatThrownBy(() -> marcaService.atualizarParaUsuario(ID_USUARIO, umidaDaRacao.getUuid(),
                new MarcaRequest("úmida", null)))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage(MENSAGEM_NOME_REPETIDO);
        assertThat(umidaDaRacao.getPai()).isSameAs(racao);
    }

    @Test
    void moverParaOutroPaiAtualizaCaminho() {
        Marca racao = existente(null, "Ração");
        Marca umida = existente(racao, "Úmida");
        Marca sache = existente(umida, "Sachê");
        Marca seca = existente(racao, "Seca");

        MarcaResponse resposta = marcaService.atualizarParaUsuario(ID_USUARIO, sache.getUuid(),
                new MarcaRequest("Sachê", seca.getUuid()));

        assertThat(resposta.caminho()).isEqualTo("Ração › Seca › Sachê");
        assertThat(resposta.parentId()).isEqualTo(seca.getUuid());
        assertThat(sache.getPai()).isSameAs(seca);
    }

    @Test
    void renomearParaOProprioNomeComOutraCaixaEPermitido() {
        Marca bebidas = existente(null, "Bebidas");

        MarcaResponse resposta = marcaService.atualizarParaUsuario(ID_USUARIO, bebidas.getUuid(),
                new MarcaRequest("BEBIDAS", null));

        assertThat(resposta.nome()).isEqualTo("BEBIDAS");
    }

    @Test
    void moverParaOPaiAtualNaoConflitaComOProprioNome() {
        // PATCH sem mudanca real: a propria marca nao conta como irma repetida.
        Marca racao = existente(null, "Ração");
        Marca umida = existente(racao, "Úmida");
        existente(racao, "Seca");

        MarcaResponse resposta = marcaService.atualizarParaUsuario(ID_USUARIO, umida.getUuid(),
                new MarcaRequest("Úmida", racao.getUuid()));

        assertThat(resposta.caminho()).isEqualTo("Ração › Úmida");
        assertThat(resposta.parentId()).isEqualTo(racao.getUuid());
        verify(marcaRepository).save(umida);
    }

    @Test
    void moverTravaAEmpresaAntesDeCarregarAArvore() {
        // Serializa mover/renomear por empresa (corrida de ciclo cruzado).
        Marca racao = existente(null, "Ração");
        Marca bebidas = existente(null, "Bebidas");

        marcaService.atualizarParaUsuario(ID_USUARIO, racao.getUuid(),
                new MarcaRequest("Ração", bebidas.getUuid()));

        InOrder ordem = inOrder(empresaRepository, marcaRepository);
        ordem.verify(empresaRepository).travarPorId(ID_EMPRESA);
        ordem.verify(marcaRepository).findByEmpresa_Id(ID_EMPRESA);
    }

    @Test
    void atualizarMarcaDeOutraEmpresaLanca404() {
        Marca daOutraEmpresa = new Marca(empresaComId(ID_OUTRA_EMPRESA), null, "Ração");

        assertThatThrownBy(() -> marcaService.atualizarParaUsuario(ID_USUARIO, daOutraEmpresa.getUuid(),
                new MarcaRequest("Ração", null)))
                .isInstanceOf(CatalogoNaoEncontradoException.class);
    }

    // ---------- Exclusao ----------

    @Test
    void excluirComSubmarcaLanca409() {
        Marca racao = existente(null, "Ração");
        when(marcaRepository.countByPai_Id(racao.getId())).thenReturn(2L);
        when(marcaRepository.contarProdutos(racao.getId())).thenReturn(0L);

        assertThatThrownBy(() -> marcaService.excluirParaUsuario(ID_USUARIO, racao.getUuid()))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage("Não é possível excluir: há 2 submarca(s) nesta marca. "
                        + "Mova-os ou inative a marca.");
        verify(marcaRepository, never()).delete(any());
    }

    @Test
    void excluirComProdutoLanca409() {
        Marca racao = existente(null, "Ração");
        when(marcaRepository.countByPai_Id(racao.getId())).thenReturn(0L);
        when(marcaRepository.contarProdutos(racao.getId())).thenReturn(5L);

        assertThatThrownBy(() -> marcaService.excluirParaUsuario(ID_USUARIO, racao.getUuid()))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage("Não é possível excluir: há 5 produto(s) nesta marca. "
                        + "Mova-os ou inative a marca.");
        verify(marcaRepository, never()).delete(any());
    }

    @Test
    void excluirComAmbosMensagemCompleta() {
        Marca racao = existente(null, "Ração");
        when(marcaRepository.countByPai_Id(racao.getId())).thenReturn(2L);
        when(marcaRepository.contarProdutos(racao.getId())).thenReturn(5L);

        assertThatThrownBy(() -> marcaService.excluirParaUsuario(ID_USUARIO, racao.getUuid()))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage("Não é possível excluir: há 2 submarca(s) e 5 produto(s) nesta marca. "
                        + "Mova-os ou inative a marca.");
    }

    @Test
    void excluirComFornecedorLanca409() {
        Marca racao = existente(null, "Ração");
        when(marcaRepository.contarFornecedores(racao.getId())).thenReturn(2L);

        assertThatThrownBy(() -> marcaService.excluirParaUsuario(ID_USUARIO, racao.getUuid()))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage("Não é possível excluir: há 2 fornecedor(es) nesta marca. "
                        + "Mova-os ou inative a marca.");
        verify(marcaRepository, never()).delete(any());
    }

    @Test
    void excluirComOsTresVinculosMensagemDaSpec() {
        Marca boehringer = existente(null, "Boehringer");
        when(marcaRepository.countByPai_Id(boehringer.getId())).thenReturn(1L);
        when(marcaRepository.contarProdutos(boehringer.getId())).thenReturn(4L);
        when(marcaRepository.contarFornecedores(boehringer.getId())).thenReturn(2L);

        assertThatThrownBy(() -> marcaService.excluirParaUsuario(ID_USUARIO, boehringer.getUuid()))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage("Não é possível excluir: há 1 submarca(s), 4 produto(s) e 2 fornecedor(es) nesta "
                        + "marca. Mova-os ou inative a marca.");
    }

    @Test
    void excluirSemVinculosRemove() {
        Marca racao = existente(null, "Ração");
        when(marcaRepository.countByPai_Id(racao.getId())).thenReturn(0L);
        when(marcaRepository.contarProdutos(racao.getId())).thenReturn(0L);

        marcaService.excluirParaUsuario(ID_USUARIO, racao.getUuid());

        verify(marcaRepository).delete(racao);
    }

    @Test
    void excluirTravaAEmpresaAntesDeContarOsVinculos() {
        Marca racao = existente(null, "Ração");

        marcaService.excluirParaUsuario(ID_USUARIO, racao.getUuid());

        InOrder ordem = inOrder(empresaRepository, marcaRepository);
        ordem.verify(empresaRepository).travarPorId(ID_EMPRESA);
        ordem.verify(marcaRepository).countByPai_Id(racao.getId());
        ordem.verify(marcaRepository).delete(racao);
    }

    @Test
    void excluirMarcaDeOutraEmpresaLanca404() {
        assertThatThrownBy(() -> marcaService.excluirParaUsuario(ID_USUARIO, UUID.randomUUID()))
                .isInstanceOf(CatalogoNaoEncontradoException.class);
        verify(marcaRepository, never()).delete(any());
    }

    // ---------- Renomear: busca dos produtos (Review Focus 3) ----------

    @Test
    void renomearRecalculaABuscaDosProdutosDaMarcaComONomeNovo() {
        Marca golden = existente(null, "Golden");

        marcaService.atualizarParaUsuario(ID_USUARIO, golden.getUuid(), new MarcaRequest("  Golden Premium ", null));

        verify(buscaDosProdutos).recalcular(ID_EMPRESA, golden.getId(), "Golden Premium");
    }

    @Test
    void moverSemRenomearNaoRecalculaABusca() {
        Marca boehringer = existente(null, "Boehringer");
        Marca nexgard = existente(null, "Nexgard");

        marcaService.atualizarParaUsuario(ID_USUARIO, nexgard.getUuid(),
                new MarcaRequest("Nexgard", boehringer.getUuid()));

        verify(buscaDosProdutos, never()).recalcular(any(), any(), any());
    }

    @Test
    void trocarSoAsMaiusculasDoNomeRecalculaABusca() {
        // A busca e normalizada, mas o recalculo e barato e fica sempre coerente com o nome gravado.
        Marca golden = existente(null, "golden");

        marcaService.atualizarParaUsuario(ID_USUARIO, golden.getUuid(), new MarcaRequest("Golden", null));

        verify(buscaDosProdutos).recalcular(ID_EMPRESA, golden.getId(), "Golden");
    }

    // ---------- Inativar / reativar ----------

    @Test
    void inativarNaoAlteraFilhos() {
        Marca racao = existente(null, "Ração");
        Marca umida = existente(racao, "Úmida");

        MarcaResponse resposta = marcaService.inativarParaUsuario(ID_USUARIO, racao.getUuid());

        assertThat(resposta.ativo()).isFalse();
        assertThat(resposta.selecionavel()).isFalse();
        assertThat(umida.isAtivo()).isTrue();
    }

    @Test
    void reativarDevolveSelecionavel() {
        Marca racao = existente(null, "Ração");
        racao.inativar();

        MarcaResponse resposta = marcaService.reativarParaUsuario(ID_USUARIO, racao.getUuid());

        assertThat(resposta.ativo()).isTrue();
        assertThat(resposta.selecionavel()).isTrue();
    }

    // ---------- Listagem ----------

    @Test
    void listarOrdenaPorCaminhoComContagens() {
        Marca racao = existente(null, "Ração");
        Marca umida = existente(racao, "Úmida");
        existente(null, "Bebidas");
        umida.inativar();
        List<Object[]> contagens = new ArrayList<>();
        contagens.add(new Object[] { racao.getId(), 3L });
        when(marcaRepository.contarProdutosPorMarca(ID_EMPRESA)).thenReturn(contagens);
        List<Object[]> fornecedores = new ArrayList<>();
        fornecedores.add(new Object[] { racao.getId(), 2L });
        when(marcaRepository.contarFornecedoresPorMarca(ID_EMPRESA)).thenReturn(fornecedores);

        List<MarcaResponse> respostas = marcaService.listarParaUsuario(ID_USUARIO, null);

        assertThat(respostas).extracting(MarcaResponse::caminho)
                .containsExactly("Bebidas", "Ração", "Ração › Úmida");
        MarcaResponse respostaRacao = respostas.get(1);
        assertThat(respostaRacao.quantidadeProdutos()).isEqualTo(3L);
        assertThat(respostaRacao.quantidadeFornecedores()).isEqualTo(2L);
        assertThat(respostaRacao.quantidadeSubmarcas()).isEqualTo(1);
        assertThat(respostas.get(0).quantidadeProdutos()).isZero();
    }

    @Test
    void listarFiltraPorStatus() {
        Marca racao = existente(null, "Ração");
        Marca umida = existente(racao, "Úmida");
        umida.inativar();

        assertThat(marcaService.listarParaUsuario(ID_USUARIO, false))
                .extracting(MarcaResponse::nome).containsExactly("Úmida");
        assertThat(marcaService.listarParaUsuario(ID_USUARIO, true))
                .extracting(MarcaResponse::nome).containsExactly("Ração");
    }
}
