package com.geitus.app.catalog.categoria;

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
import com.geitus.app.catalog.categoria.dto.CategoriaRequest;
import com.geitus.app.catalog.categoria.dto.CategoriaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Testa as regras do {@link CategoriaService}: isolamento por empresa
 * (DEC-016), nome unico entre irmaos sem diferenciar maiusculas, bloqueio de
 * ciclos ao mover, bloqueio de exclusao com vinculos (mensagens fixas) e
 * inativacao sem cascata (docs/modules/categorias-e-unidades.md, 4.2).
 */
@ExtendWith(MockitoExtension.class)
class CategoriaServiceTest {

    private static final Long ID_USUARIO = 1L;
    private static final Long ID_EMPRESA = 7L;
    private static final Long ID_OUTRA_EMPRESA = 8L;
    private static final String MENSAGEM_CICLO =
            "Uma categoria não pode ficar dentro dela mesma ou de uma subcategoria sua.";
    private static final String MENSAGEM_NOME_REPETIDO = "Já existe uma categoria com este nome neste nível.";

    @Mock
    private CategoriaRepository categoriaRepository;

    @Mock
    private EmpresaRepository empresaRepository;

    @Mock
    private UsuarioRepository usuarioRepository;

    @InjectMocks
    private CategoriaService categoriaService;

    private final AtomicLong proximoId = new AtomicLong(1);
    private final List<Categoria> daEmpresa = new ArrayList<>();
    private Empresa empresa;

    @BeforeEach
    void usuarioAtivoDaEmpresa() {
        empresa = empresaComId(ID_EMPRESA);
        Usuario usuario = new Usuario(empresa, "Admin", "admin@geitus.com", "hash", "ADMIN");
        lenient().when(usuarioRepository.findById(ID_USUARIO)).thenReturn(Optional.of(usuario));
        lenient().when(categoriaRepository.findByEmpresa_Id(ID_EMPRESA)).thenReturn(daEmpresa);
        lenient().when(empresaRepository.findById(ID_EMPRESA)).thenReturn(Optional.of(empresa));
        lenient().when(empresaRepository.travarPorId(ID_EMPRESA)).thenReturn(Optional.of(empresa));
        lenient().when(categoriaRepository.save(any(Categoria.class))).thenAnswer(invocacao -> {
            Categoria salva = invocacao.getArgument(0);
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

    private Categoria existente(Categoria pai, String nome) {
        Categoria categoria = new Categoria(empresa, pai, nome);
        ReflectionTestUtils.setField(categoria, "id", proximoId.getAndIncrement());
        daEmpresa.add(categoria);
        lenient().when(categoriaRepository.findByUuidAndEmpresa_Id(categoria.getUuid(), ID_EMPRESA))
                .thenReturn(Optional.of(categoria));
        return categoria;
    }

    // ---------- Cadastro ----------

    @Test
    void cadastrarNaRaizDevolveCaminhoENivel() {
        CategoriaResponse resposta = categoriaService.cadastrarParaUsuario(ID_USUARIO,
                new CategoriaRequest("  Bebidas  ", null));

        assertThat(resposta.nome()).isEqualTo("Bebidas");
        assertThat(resposta.parentId()).isNull();
        assertThat(resposta.caminho()).isEqualTo("Bebidas");
        assertThat(resposta.nivel()).isZero();
        assertThat(resposta.selecionavel()).isTrue();
    }

    @Test
    void cadastrarComPaiMontaCaminhoCompleto() {
        Categoria racao = existente(null, "Ração");
        Categoria umida = existente(racao, "Úmida");

        CategoriaResponse resposta = categoriaService.cadastrarParaUsuario(ID_USUARIO,
                new CategoriaRequest("Sachê", umida.getUuid()));

        assertThat(resposta.caminho()).isEqualTo("Ração › Úmida › Sachê");
        assertThat(resposta.nivel()).isEqualTo(2);
        assertThat(resposta.parentId()).isEqualTo(umida.getUuid());
    }

    @Test
    void criarComPaiDeOutraEmpresaLanca404() {
        // O pai existe, mas em outra empresa: nao aparece na lista desta empresa.
        Categoria daOutraEmpresa = new Categoria(empresaComId(ID_OUTRA_EMPRESA), null, "Ração");

        assertThatThrownBy(() -> categoriaService.cadastrarParaUsuario(ID_USUARIO,
                new CategoriaRequest("Úmida", daOutraEmpresa.getUuid())))
                .isInstanceOf(CatalogoNaoEncontradoException.class);
        verify(categoriaRepository, never()).save(any());
    }

    @Test
    void nomeRepetidoEntreIrmaosLanca409() {
        Categoria racao = existente(null, "Ração");
        existente(racao, "Úmida");

        assertThatThrownBy(() -> categoriaService.cadastrarParaUsuario(ID_USUARIO,
                new CategoriaRequest(" ÚMIDA ", racao.getUuid())))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage(MENSAGEM_NOME_REPETIDO);
        verify(categoriaRepository, never()).save(any());
    }

    @Test
    void nomeRepetidoNaRaizLanca409() {
        existente(null, "Bebidas");

        assertThatThrownBy(() -> categoriaService.cadastrarParaUsuario(ID_USUARIO,
                new CategoriaRequest("bebidas", null)))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage(MENSAGEM_NOME_REPETIDO);
    }

    @Test
    void mesmoNomeEmPaisDiferentesEPermitido() {
        Categoria racao = existente(null, "Ração");
        Categoria umida = existente(racao, "Úmida");
        Categoria seca = existente(racao, "Seca");
        existente(umida, "Sachê");

        CategoriaResponse resposta = categoriaService.cadastrarParaUsuario(ID_USUARIO,
                new CategoriaRequest("Sachê", seca.getUuid()));

        assertThat(resposta.caminho()).isEqualTo("Ração › Seca › Sachê");
    }

    // ---------- Edicao (renomear e mover) ----------

    @Test
    void moverParaNetoLanca400ComMensagemFixa() {
        Categoria racao = existente(null, "Ração");
        Categoria umida = existente(racao, "Úmida");
        Categoria sache = existente(umida, "Sachê");

        assertThatThrownBy(() -> categoriaService.atualizarParaUsuario(ID_USUARIO, racao.getUuid(),
                new CategoriaRequest("Ração", sache.getUuid())))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage(MENSAGEM_CICLO);
        assertThat(racao.getPai()).isNull();
        verify(categoriaRepository, never()).save(any());
    }

    @Test
    void moverParaSiMesmaLanca400() {
        Categoria racao = existente(null, "Ração");

        assertThatThrownBy(() -> categoriaService.atualizarParaUsuario(ID_USUARIO, racao.getUuid(),
                new CategoriaRequest("Ração", racao.getUuid())))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage(MENSAGEM_CICLO);
    }

    @Test
    void moverParaRaizComNomeJaExistenteNaRaizLanca409() {
        existente(null, "Úmida");
        Categoria racao = existente(null, "Ração");
        Categoria umidaDaRacao = existente(racao, "úmida");

        assertThatThrownBy(() -> categoriaService.atualizarParaUsuario(ID_USUARIO, umidaDaRacao.getUuid(),
                new CategoriaRequest("úmida", null)))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage(MENSAGEM_NOME_REPETIDO);
        assertThat(umidaDaRacao.getPai()).isSameAs(racao);
    }

    @Test
    void moverParaOutroPaiAtualizaCaminho() {
        Categoria racao = existente(null, "Ração");
        Categoria umida = existente(racao, "Úmida");
        Categoria sache = existente(umida, "Sachê");
        Categoria seca = existente(racao, "Seca");

        CategoriaResponse resposta = categoriaService.atualizarParaUsuario(ID_USUARIO, sache.getUuid(),
                new CategoriaRequest("Sachê", seca.getUuid()));

        assertThat(resposta.caminho()).isEqualTo("Ração › Seca › Sachê");
        assertThat(resposta.parentId()).isEqualTo(seca.getUuid());
        assertThat(sache.getPai()).isSameAs(seca);
    }

    @Test
    void renomearParaOProprioNomeComOutraCaixaEPermitido() {
        Categoria bebidas = existente(null, "Bebidas");

        CategoriaResponse resposta = categoriaService.atualizarParaUsuario(ID_USUARIO, bebidas.getUuid(),
                new CategoriaRequest("BEBIDAS", null));

        assertThat(resposta.nome()).isEqualTo("BEBIDAS");
    }

    @Test
    void moverTravaAEmpresaAntesDeCarregarAArvore() {
        // Serializa mover/renomear por empresa (corrida de ciclo cruzado).
        Categoria racao = existente(null, "Ração");
        Categoria bebidas = existente(null, "Bebidas");

        categoriaService.atualizarParaUsuario(ID_USUARIO, racao.getUuid(),
                new CategoriaRequest("Ração", bebidas.getUuid()));

        InOrder ordem = inOrder(empresaRepository, categoriaRepository);
        ordem.verify(empresaRepository).travarPorId(ID_EMPRESA);
        ordem.verify(categoriaRepository).findByEmpresa_Id(ID_EMPRESA);
    }

    @Test
    void atualizarCategoriaDeOutraEmpresaLanca404() {
        Categoria daOutraEmpresa = new Categoria(empresaComId(ID_OUTRA_EMPRESA), null, "Ração");

        assertThatThrownBy(() -> categoriaService.atualizarParaUsuario(ID_USUARIO, daOutraEmpresa.getUuid(),
                new CategoriaRequest("Ração", null)))
                .isInstanceOf(CatalogoNaoEncontradoException.class);
    }

    // ---------- Exclusao ----------

    @Test
    void excluirComSubcategoriaLanca409() {
        Categoria racao = existente(null, "Ração");
        when(categoriaRepository.countByPai_Id(racao.getId())).thenReturn(2L);
        when(categoriaRepository.contarProdutos(racao.getId())).thenReturn(0L);

        assertThatThrownBy(() -> categoriaService.excluirParaUsuario(ID_USUARIO, racao.getUuid()))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage("Não é possível excluir: há 2 subcategoria(s) nesta categoria. "
                        + "Mova-os ou inative a categoria.");
        verify(categoriaRepository, never()).delete(any());
    }

    @Test
    void excluirComProdutoLanca409() {
        Categoria racao = existente(null, "Ração");
        when(categoriaRepository.countByPai_Id(racao.getId())).thenReturn(0L);
        when(categoriaRepository.contarProdutos(racao.getId())).thenReturn(5L);

        assertThatThrownBy(() -> categoriaService.excluirParaUsuario(ID_USUARIO, racao.getUuid()))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage("Não é possível excluir: há 5 produto(s) nesta categoria. "
                        + "Mova-os ou inative a categoria.");
        verify(categoriaRepository, never()).delete(any());
    }

    @Test
    void excluirComAmbosMensagemCompleta() {
        Categoria racao = existente(null, "Ração");
        when(categoriaRepository.countByPai_Id(racao.getId())).thenReturn(2L);
        when(categoriaRepository.contarProdutos(racao.getId())).thenReturn(5L);

        assertThatThrownBy(() -> categoriaService.excluirParaUsuario(ID_USUARIO, racao.getUuid()))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage("Não é possível excluir: há 2 subcategoria(s) e 5 produto(s) nesta categoria. "
                        + "Mova-os ou inative a categoria.");
    }

    @Test
    void excluirSemVinculosRemove() {
        Categoria racao = existente(null, "Ração");
        when(categoriaRepository.countByPai_Id(racao.getId())).thenReturn(0L);
        when(categoriaRepository.contarProdutos(racao.getId())).thenReturn(0L);

        categoriaService.excluirParaUsuario(ID_USUARIO, racao.getUuid());

        verify(categoriaRepository).delete(racao);
    }

    @Test
    void excluirTravaAEmpresaAntesDeContarOsVinculos() {
        Categoria racao = existente(null, "Ração");

        categoriaService.excluirParaUsuario(ID_USUARIO, racao.getUuid());

        InOrder ordem = inOrder(empresaRepository, categoriaRepository);
        ordem.verify(empresaRepository).travarPorId(ID_EMPRESA);
        ordem.verify(categoriaRepository).countByPai_Id(racao.getId());
        ordem.verify(categoriaRepository).delete(racao);
    }

    @Test
    void excluirCategoriaDeOutraEmpresaLanca404() {
        assertThatThrownBy(() -> categoriaService.excluirParaUsuario(ID_USUARIO, UUID.randomUUID()))
                .isInstanceOf(CatalogoNaoEncontradoException.class);
        verify(categoriaRepository, never()).delete(any());
    }

    // ---------- Inativar / reativar ----------

    @Test
    void inativarNaoAlteraFilhos() {
        Categoria racao = existente(null, "Ração");
        Categoria umida = existente(racao, "Úmida");

        CategoriaResponse resposta = categoriaService.inativarParaUsuario(ID_USUARIO, racao.getUuid());

        assertThat(resposta.ativo()).isFalse();
        assertThat(resposta.selecionavel()).isFalse();
        assertThat(umida.isAtivo()).isTrue();
    }

    @Test
    void reativarDevolveSelecionavel() {
        Categoria racao = existente(null, "Ração");
        racao.inativar();

        CategoriaResponse resposta = categoriaService.reativarParaUsuario(ID_USUARIO, racao.getUuid());

        assertThat(resposta.ativo()).isTrue();
        assertThat(resposta.selecionavel()).isTrue();
    }

    // ---------- Listagem ----------

    @Test
    void listarOrdenaPorCaminhoComContagens() {
        Categoria racao = existente(null, "Ração");
        Categoria umida = existente(racao, "Úmida");
        existente(null, "Bebidas");
        umida.inativar();
        List<Object[]> contagens = new ArrayList<>();
        contagens.add(new Object[] { racao.getId(), 3L });
        when(categoriaRepository.contarProdutosPorCategoria(ID_EMPRESA)).thenReturn(contagens);

        List<CategoriaResponse> respostas = categoriaService.listarParaUsuario(ID_USUARIO, null);

        assertThat(respostas).extracting(CategoriaResponse::caminho)
                .containsExactly("Bebidas", "Ração", "Ração › Úmida");
        CategoriaResponse respostaRacao = respostas.get(1);
        assertThat(respostaRacao.quantidadeProdutos()).isEqualTo(3L);
        assertThat(respostaRacao.quantidadeSubcategorias()).isEqualTo(1);
        assertThat(respostas.get(0).quantidadeProdutos()).isZero();
    }

    @Test
    void listarFiltraPorStatus() {
        Categoria racao = existente(null, "Ração");
        Categoria umida = existente(racao, "Úmida");
        umida.inativar();

        assertThat(categoriaService.listarParaUsuario(ID_USUARIO, false))
                .extracting(CategoriaResponse::nome).containsExactly("Úmida");
        assertThat(categoriaService.listarParaUsuario(ID_USUARIO, true))
                .extracting(CategoriaResponse::nome).containsExactly("Ração");
    }
}
