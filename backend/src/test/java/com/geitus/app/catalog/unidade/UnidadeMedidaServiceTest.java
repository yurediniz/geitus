package com.geitus.app.catalog.unidade;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.catalog.CatalogoConflitoException;
import com.geitus.app.catalog.CatalogoNaoEncontradoException;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.UsoDoProdutoNoEstoque;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaRequest;
import com.geitus.app.catalog.unidade.dto.UnidadeMedidaResponse;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;

/**
 * Testa as regras do {@link UnidadeMedidaService}: normalizacao da sigla,
 * sigla unica por empresa, bloqueio de exclusao de unidade em uso (venda ou
 * compra), unidades padrao idempotentes e a regra de quantidade por unidade
 * (docs/modules/categorias-e-unidades.md, 3.2–3.3).
 */
@ExtendWith(MockitoExtension.class)
class UnidadeMedidaServiceTest {

    private static final Long ID_USUARIO = 1L;
    private static final Long ID_EMPRESA = 7L;
    private static final Long ID_UNIDADE = 42L;
    private static final String MENSAGEM_SIGLA_REPETIDA = "Já existe uma unidade com esta sigla.";

    @Mock
    private UnidadeMedidaRepository unidadeRepository;

    @Mock
    private EmpresaRepository empresaRepository;

    @Mock
    private UsuarioRepository usuarioRepository;

    @Mock
    private UsoDoProdutoNoEstoque usoNoEstoque;

    @InjectMocks
    private UnidadeMedidaService unidadeService;

    private Empresa empresa;

    @BeforeEach
    void usuarioAtivoDaEmpresa() {
        empresa = new Empresa("Empresa");
        ReflectionTestUtils.setField(empresa, "id", ID_EMPRESA);
        Usuario usuario = new Usuario(empresa, "Admin", "admin@geitus.com", "hash", "ADMIN");
        lenient().when(usuarioRepository.findById(ID_USUARIO)).thenReturn(Optional.of(usuario));
        lenient().when(empresaRepository.findById(ID_EMPRESA)).thenReturn(Optional.of(empresa));
        lenient().when(unidadeRepository.save(any(UnidadeMedida.class)))
                .thenAnswer(invocacao -> invocacao.getArgument(0));
    }

    private UnidadeMedida existente(String sigla) {
        UnidadeMedida unidade = new UnidadeMedida(empresa, sigla, "Descrição " + sigla, false);
        ReflectionTestUtils.setField(unidade, "id", ID_UNIDADE);
        lenient().when(unidadeRepository.findByUuidAndEmpresa_Id(unidade.getUuid(), ID_EMPRESA))
                .thenReturn(Optional.of(unidade));
        return unidade;
    }

    // ---------- Cadastro e edicao ----------

    @Test
    void siglaNormalizadaParaMaiusculasSemEspacos() {
        UnidadeMedidaResponse resposta = unidadeService.cadastrarParaUsuario(ID_USUARIO,
                new UnidadeMedidaRequest(" kg ", "  Quilograma ", true));

        assertThat(resposta.sigla()).isEqualTo("KG");
        assertThat(resposta.descricao()).isEqualTo("Quilograma");
        assertThat(resposta.fracionada()).isTrue();
        assertThat(resposta.ativo()).isTrue();
        assertThat(resposta.emUso()).isZero();
        verify(unidadeRepository).existsBySiglaAndEmpresa_Id("KG", ID_EMPRESA);
    }

    @Test
    void siglaQueCresceAoNormalizarAlemDe20CaracteresLanca400() {
        // 11 "ß" passam no @Size(max = 20), mas viram 22 caracteres ("SS" cada).
        String sigla = "ß".repeat(11);

        assertThatThrownBy(() -> unidadeService.cadastrarParaUsuario(ID_USUARIO,
                new UnidadeMedidaRequest(sigla, "Unidade", false)))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("A sigla deve ter no máximo 20 caracteres.");
        verify(unidadeRepository, never()).save(any());
    }

    @Test
    void siglaNormalizadaComExatos20CaracteresEAceita() {
        UnidadeMedidaResponse resposta = unidadeService.cadastrarParaUsuario(ID_USUARIO,
                new UnidadeMedidaRequest("ß".repeat(10), "Unidade", false));

        assertThat(resposta.sigla()).isEqualTo("SS".repeat(10));
    }

    @Test
    void siglaRepetidaLanca409() {
        when(unidadeRepository.existsBySiglaAndEmpresa_Id("KG", ID_EMPRESA)).thenReturn(true);

        assertThatThrownBy(() -> unidadeService.cadastrarParaUsuario(ID_USUARIO,
                new UnidadeMedidaRequest("kg", "Quilo", true)))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage(MENSAGEM_SIGLA_REPETIDA);
        verify(unidadeRepository, never()).save(any());
    }

    @Test
    void editarComSiglaDeOutraUnidadeLanca409() {
        UnidadeMedida unidade = existente("CX");
        when(unidadeRepository.existsBySiglaAndEmpresa_IdAndIdNot("UN", ID_EMPRESA, ID_UNIDADE)).thenReturn(true);

        assertThatThrownBy(() -> unidadeService.atualizarParaUsuario(ID_USUARIO, unidade.getUuid(),
                new UnidadeMedidaRequest("un", "Caixa", false)))
                .isInstanceOf(CatalogoConflitoException.class)
                .hasMessage(MENSAGEM_SIGLA_REPETIDA);
        assertThat(unidade.getSigla()).isEqualTo("CX");
    }

    @Test
    void editarAtualizaDadosEInformaUso() {
        UnidadeMedida unidade = existente("CX");
        when(unidadeRepository.contarProdutosQueUsam(ID_UNIDADE)).thenReturn(4L);

        UnidadeMedidaResponse resposta = unidadeService.atualizarParaUsuario(ID_USUARIO, unidade.getUuid(),
                new UnidadeMedidaRequest("cx12", "Caixa com 12", false));

        assertThat(resposta.sigla()).isEqualTo("CX12");
        assertThat(resposta.descricao()).isEqualTo("Caixa com 12");
        assertThat(resposta.emUso()).isEqualTo(4L);
    }

    @Test
    void editarUnidadeDeOutraEmpresaLanca404() {
        assertThatThrownBy(() -> unidadeService.atualizarParaUsuario(ID_USUARIO, UUID.randomUUID(),
                new UnidadeMedidaRequest("UN", "Unidade", false)))
                .isInstanceOf(CatalogoNaoEncontradoException.class);
    }

    // ---------- Fase D: unidade usada por produto movimentado (produtos-estoque.md, 4.8) ----------

    private UnidadeMedida existenteFracionada(String sigla) {
        UnidadeMedida unidade = existente(sigla);
        unidade.atualizar(sigla, "Descrição " + sigla, true);
        return unidade;
    }

    @Test
    void desligarFracionadaComProdutoMovimentado_400() {
        UnidadeMedida kg = existenteFracionada("KG");
        when(usoNoEstoque.algumProdutoDaUnidadeTemMovimentos(ID_EMPRESA, ID_UNIDADE)).thenReturn(true);

        assertThatThrownBy(() -> unidadeService.atualizarParaUsuario(ID_USUARIO, kg.getUuid(),
                new UnidadeMedidaRequest("KG", "Quilograma", false)))
                .isInstanceOf(RegraDeNegocioException.class)
                .hasMessage("Esta unidade é usada por produtos com movimentação de estoque.");
        assertThat(kg.isFracionada()).isTrue();
        verify(unidadeRepository, never()).save(any());
    }

    @Test
    void desligarFracionadaSemMovimento_ok() {
        UnidadeMedida kg = existenteFracionada("KG");

        UnidadeMedidaResponse resposta = unidadeService.atualizarParaUsuario(ID_USUARIO, kg.getUuid(),
                new UnidadeMedidaRequest("KG", "Quilograma", false));

        assertThat(resposta.fracionada()).isFalse();
        verify(usoNoEstoque).algumProdutoDaUnidadeTemMovimentos(ID_EMPRESA, ID_UNIDADE);
    }

    @Test
    void manterOuLigarFracionadaNaoConsultaOEstoque() {
        UnidadeMedida kg = existenteFracionada("KG");
        UnidadeMedida cx = existente("CX");

        unidadeService.atualizarParaUsuario(ID_USUARIO, kg.getUuid(), new UnidadeMedidaRequest("KG", "Quilo", true));
        unidadeService.atualizarParaUsuario(ID_USUARIO, cx.getUuid(), new UnidadeMedidaRequest("CX", "Caixa", true));

        verify(usoNoEstoque, never()).algumProdutoDaUnidadeTemMovimentos(anyLong(), anyLong());
    }

    // ---------- Exclusao ----------

    @Test
    void excluirEmUsoComoVendaLanca409() {
        UnidadeMedida unidade = existente("UN");
        when(unidadeRepository.contarProdutosQueUsam(ID_UNIDADE)).thenReturn(1L);

        assertThatThrownBy(() -> unidadeService.excluirParaUsuario(ID_USUARIO, unidade.getUuid()))
                .isInstanceOf(CatalogoConflitoException.class);
        verify(unidadeRepository, never()).delete(any());
    }

    @Test
    void excluirEmUsoSoComoCompraLanca409() {
        // O repositorio conta venda OU compra (exercido contra Postgres real no
        // CatalogoRepositoryIT); aqui garantimos que o service usa essa contagem.
        UnidadeMedida unidade = existente("FD");
        when(unidadeRepository.contarProdutosQueUsam(ID_UNIDADE)).thenReturn(1L);

        assertThatThrownBy(() -> unidadeService.excluirParaUsuario(ID_USUARIO, unidade.getUuid()))
                .isInstanceOf(CatalogoConflitoException.class);
        verify(unidadeRepository, never()).delete(any());
    }

    @Test
    void mensagemDeUsoComContagem() {
        UnidadeMedida unidade = existente("UN");
        when(unidadeRepository.contarProdutosQueUsam(ID_UNIDADE)).thenReturn(3L);

        assertThatThrownBy(() -> unidadeService.excluirParaUsuario(ID_USUARIO, unidade.getUuid()))
                .hasMessage("Esta unidade está em uso por 3 produto(s). "
                        + "Inative-a para que não apareça em novos cadastros.");
    }

    @Test
    void excluirSemUsoRemove() {
        UnidadeMedida unidade = existente("UN");
        when(unidadeRepository.contarProdutosQueUsam(ID_UNIDADE)).thenReturn(0L);

        unidadeService.excluirParaUsuario(ID_USUARIO, unidade.getUuid());

        verify(unidadeRepository).delete(unidade);
    }

    @Test
    void excluirUnidadeDeOutraEmpresaLanca404() {
        assertThatThrownBy(() -> unidadeService.excluirParaUsuario(ID_USUARIO, UUID.randomUUID()))
                .isInstanceOf(CatalogoNaoEncontradoException.class);
        verify(unidadeRepository, never()).delete(any());
    }

    // ---------- Inativar / reativar ----------

    @Test
    void inativarEReativar() {
        UnidadeMedida unidade = existente("UN");

        assertThat(unidadeService.inativarParaUsuario(ID_USUARIO, unidade.getUuid()).ativo()).isFalse();
        assertThat(unidadeService.reativarParaUsuario(ID_USUARIO, unidade.getUuid()).ativo()).isTrue();
    }

    // ---------- Listagem ----------

    @Test
    void listarInformaUsoDeCadaUnidade() {
        UnidadeMedida cx = new UnidadeMedida(empresa, "CX", "Caixa", false);
        ReflectionTestUtils.setField(cx, "id", 1L);
        UnidadeMedida un = new UnidadeMedida(empresa, "UN", "Unidade", false);
        ReflectionTestUtils.setField(un, "id", 2L);
        when(unidadeRepository.findByEmpresa_IdOrderBySigla(ID_EMPRESA)).thenReturn(List.of(cx, un));
        List<Object[]> uso = new ArrayList<>();
        uso.add(new Object[] { 2L, 5L });
        when(unidadeRepository.contarUsoPorUnidade(ID_EMPRESA)).thenReturn(uso);

        List<UnidadeMedidaResponse> respostas = unidadeService.listarParaUsuario(ID_USUARIO, null);

        assertThat(respostas).extracting(UnidadeMedidaResponse::sigla).containsExactly("CX", "UN");
        assertThat(respostas).extracting(UnidadeMedidaResponse::emUso).containsExactly(0L, 5L);
    }

    @Test
    void listarFiltraPorStatus() {
        when(unidadeRepository.findByEmpresa_IdAndAtivoOrderBySigla(ID_EMPRESA, true)).thenReturn(List.of());

        assertThat(unidadeService.listarParaUsuario(ID_USUARIO, true)).isEmpty();
        verify(unidadeRepository, never()).findByEmpresa_IdOrderBySigla(anyLong());
    }

    // ---------- Unidades padrao ----------

    @Test
    void criarPadroesCriaAsDezEEIdempotente() {
        ArgumentCaptor<UnidadeMedida> salvas = ArgumentCaptor.forClass(UnidadeMedida.class);

        unidadeService.criarPadroes(empresa);

        verify(unidadeRepository, times(10)).save(salvas.capture());
        assertThat(salvas.getAllValues())
                .extracting(UnidadeMedida::getSigla)
                .containsExactly("UN", "KG", "G", "L", "ML", "M", "CX", "PCT", "DZ", "FD");
        assertThat(salvas.getAllValues())
                .filteredOn(UnidadeMedida::isFracionada)
                .extracting(UnidadeMedida::getSigla)
                .containsExactly("KG", "G", "L", "ML", "M");
        assertThat(salvas.getAllValues()).allSatisfy(unidade -> {
            assertThat(unidade.getEmpresaId()).isEqualTo(ID_EMPRESA);
            assertThat(unidade.isAtivo()).isTrue();
        });
    }

    @Test
    void criarPadroesNaoDuplicaSiglaJaExistente() {
        when(unidadeRepository.existsBySiglaAndEmpresa_Id(anyString(), eq(ID_EMPRESA))).thenReturn(true);

        unidadeService.criarPadroes(empresa);

        verify(unidadeRepository, never()).save(any());
    }

    @Test
    void criarPadroesCompletaSoAsQueFaltam() {
        when(unidadeRepository.existsBySiglaAndEmpresa_Id(anyString(), eq(ID_EMPRESA))).thenReturn(true);
        when(unidadeRepository.existsBySiglaAndEmpresa_Id("DZ", ID_EMPRESA)).thenReturn(false);
        ArgumentCaptor<UnidadeMedida> salvas = ArgumentCaptor.forClass(UnidadeMedida.class);

        unidadeService.criarPadroes(empresa);

        verify(unidadeRepository).save(salvas.capture());
        assertThat(salvas.getValue().getSigla()).isEqualTo("DZ");
        assertThat(salvas.getValue().getDescricao()).isEqualTo("Dúzia");
    }

    // ---------- Regra de quantidade (dominio, ainda sem consumidor) ----------

    @Test
    void quantidadeValida() {
        assertThat(UnidadeMedida.quantidadeValida(false, new BigDecimal("1"))).isTrue();
        assertThat(UnidadeMedida.quantidadeValida(false, new BigDecimal("1.000"))).isTrue();
        assertThat(UnidadeMedida.quantidadeValida(false, new BigDecimal("1.5"))).isFalse();
        assertThat(UnidadeMedida.quantidadeValida(true, new BigDecimal("0.375"))).isTrue();
        assertThat(UnidadeMedida.quantidadeValida(false, BigDecimal.ZERO)).isFalse();
        assertThat(UnidadeMedida.quantidadeValida(true, BigDecimal.ZERO)).isFalse();
        assertThat(UnidadeMedida.quantidadeValida(false, new BigDecimal("-1"))).isFalse();
        assertThat(UnidadeMedida.quantidadeValida(true, new BigDecimal("-1"))).isFalse();
    }

    @Test
    void quantidadeNulaEInvalida() {
        assertThat(UnidadeMedida.quantidadeValida(true, null)).isFalse();
    }

    @Test
    void quantidadeInteiraGrandeComEscalaNegativaEValida() {
        // stripTrailingZeros() de 100 vira 1E+2 (escala -2): continua inteira.
        assertThat(UnidadeMedida.quantidadeValida(false, new BigDecimal("100.00"))).isTrue();
    }
}
