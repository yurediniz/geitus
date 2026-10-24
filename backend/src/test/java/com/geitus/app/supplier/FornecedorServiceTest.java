package com.geitus.app.supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.catalog.ProdutosDoFornecedor;
import com.geitus.app.catalog.arvore.Arvore;
import com.geitus.app.catalog.marca.Marca;
import com.geitus.app.catalog.marca.MarcaService;
import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.shared.numeracao.Numerador;
import com.geitus.app.shared.numeracao.TipoNumeracao;
import com.geitus.app.supplier.dto.FornecedorResponse;
import com.geitus.app.supplier.dto.RepresentanteRequest;
import com.geitus.app.supplier.listagem.ConsultaDeFornecedores;

/**
 * Regras do {@link FornecedorService} que dependem do banco, com dubles
 * (docs/modules/fornecedores-e-marcas.md, 4): documento unico por empresa
 * (mensagem com o nome do outro), representantes da lista completa, marcas
 * (limite, outra empresa, inativa so se ja ligada), numeracao, exclusao com
 * produtos ou entradas e o PATCH que mantem as listas ausentes. A
 * normalizacao em si esta no {@code ValidacaoDoFornecedorTest}.
 */
@ExtendWith(MockitoExtension.class)
class FornecedorServiceTest {

    private static final Long ID_USUARIO = 1L;
    private static final Long ID_EMPRESA = 7L;
    private static final String CNPJ = "11222333000181";

    @Mock
    private FornecedorRepository fornecedorRepository;

    @Mock
    private ConsultaDeFornecedores consulta;

    @Mock
    private EmpresaRepository empresaRepository;

    @Mock
    private UsuarioRepository usuarioRepository;

    @Mock
    private Numerador numerador;

    @Mock
    private MarcaService marcaService;

    @Mock
    private ProdutosDoFornecedor produtosDoFornecedor;

    @Mock
    private EntradasDoFornecedor entradasDoFornecedor;

    private FornecedorService service;
    private Empresa empresa;
    private final List<Marca> marcasDaEmpresa = new ArrayList<>();

    @BeforeEach
    void preparar() {
        service = new FornecedorService(fornecedorRepository, consulta, empresaRepository, usuarioRepository,
                numerador, marcaService, produtosDoFornecedor, entradasDoFornecedor);
        empresa = new Empresa("Empresa");
        ReflectionTestUtils.setField(empresa, "id", ID_EMPRESA);
        Usuario usuario = new Usuario(empresa, "Admin", "admin@geitus.com", "hash", "ADMIN");
        lenient().when(usuarioRepository.findById(ID_USUARIO)).thenReturn(Optional.of(usuario));
        lenient().when(empresaRepository.findById(ID_EMPRESA)).thenReturn(Optional.of(empresa));
        lenient().when(marcaService.arvoreDaEmpresa(ID_EMPRESA)).thenAnswer(invocacao -> Arvore.de(marcasDaEmpresa));
        lenient().when(numerador.proximo(ID_EMPRESA, TipoNumeracao.FORNECEDOR)).thenReturn(3L);
        lenient().when(fornecedorRepository.save(any(Fornecedor.class))).thenAnswer(invocacao -> {
            Fornecedor salvo = invocacao.getArgument(0);
            if (salvo.getId() == null) {
                ReflectionTestUtils.setField(salvo, "id", 40L);
            }
            return salvo;
        });
    }

    // ---------- Cadastro ----------

    @Test
    void cadastroNumeraPelaSequenciaDoFornecedor() {
        FornecedorResponse resposta = service.cadastrarParaUsuario(ID_USUARIO,
                ValidacaoDoFornecedorTest.request().build());

        assertThat(resposta.numero()).isEqualTo(3L);
        assertThat(resposta.ativo()).isTrue();
        assertThat(resposta.representantes()).isEmpty();
        assertThat(resposta.marcas()).isEmpty();
    }

    @Test
    void documentoRepetidoNaEmpresaE409ComONomeDoOutro() {
        when(fornecedorRepository.razaoSocialComDocumento(ID_EMPRESA, CNPJ, null))
                .thenReturn(Optional.of("Atacado Sul"));

        assertThatThrownBy(() -> service.cadastrarParaUsuario(ID_USUARIO,
                ValidacaoDoFornecedorTest.request().documento(CNPJ).build()))
                .isInstanceOf(FornecedorConflitoException.class)
                .hasMessage("Já existe o fornecedor Atacado Sul com este CNPJ.")
                .satisfies(erro -> assertThat(((FornecedorConflitoException) erro).campo()).contains("documento"));
        verify(numerador, never()).proximo(any(), any());
    }

    @Test
    void cpfRepetidoNaEmpresaE409ComCpfNaMensagem() {
        when(fornecedorRepository.razaoSocialComDocumento(ID_EMPRESA, "11144477735", null))
                .thenReturn(Optional.of("João"));

        assertThatThrownBy(() -> service.cadastrarParaUsuario(ID_USUARIO, ValidacaoDoFornecedorTest.request()
                .tipoPessoa(TipoPessoaFornecedor.PF).documento("111.444.777-35").build()))
                .isInstanceOf(FornecedorConflitoException.class)
                .hasMessage("Já existe o fornecedor João com este CPF.");
    }

    @Test
    void cadastroComIdDeRepresentanteE404() {
        assertThatThrownBy(() -> service.cadastrarParaUsuario(ID_USUARIO, ValidacaoDoFornecedorTest.request()
                .representantes(new RepresentanteRequest(UUID.randomUUID(), "Ana", null, null)).build()))
                .isInstanceOf(FornecedorNaoEncontradoException.class)
                .hasMessage("Representante não encontrado.");
    }

    // ---------- Marcas ----------

    @Test
    void marcasQueVendeComOCaminhoESemRepeticao() {
        Marca boehringer = marca(1L, null, "Boehringer");
        Marca nexgard = marca(2L, boehringer, "Nexgard");

        FornecedorResponse resposta = service.cadastrarParaUsuario(ID_USUARIO, ValidacaoDoFornecedorTest.request()
                .marcaIds(nexgard.getUuid(), boehringer.getUuid(), nexgard.getUuid()).build());

        assertThat(resposta.marcas()).extracting(marca -> marca.caminho())
                .containsExactly("Boehringer", "Boehringer › Nexgard");
    }

    @Test
    void marcaDeOutraEmpresaE404() {
        assertThatThrownBy(() -> service.cadastrarParaUsuario(ID_USUARIO, ValidacaoDoFornecedorTest.request()
                .marcaIds(UUID.randomUUID()).build()))
                .isInstanceOf(FornecedorNaoEncontradoException.class)
                .hasMessage("Marca não encontrada.");
    }

    @Test
    void maisDeDuzentasMarcasE400() {
        UUID[] marcas = IntStream.range(0, 201).mapToObj(indice -> UUID.randomUUID()).toArray(UUID[]::new);

        assertThatThrownBy(() -> service.cadastrarParaUsuario(ID_USUARIO, ValidacaoDoFornecedorTest.request()
                .marcaIds(marcas).build()))
                .isInstanceOf(DadosFornecedorInvalidosException.class)
                .hasMessage("Informe no máximo 200 marcas.")
                .satisfies(erro -> assertThat(((DadosFornecedorInvalidosException) erro).campo()).contains("marcaIds"));
    }

    @Test
    void marcaInativaSoSeJaEstiverLigada() {
        Marca golden = marca(1L, null, "Golden");
        golden.inativar();
        Fornecedor fornecedor = existente();
        fornecedor.substituirMarcas(List.of(golden.getId()));

        FornecedorResponse mantida = service.atualizarParaUsuario(ID_USUARIO, fornecedor.getUuid(),
                ValidacaoDoFornecedorTest.request().marcaIds(golden.getUuid()).build());

        assertThat(mantida.marcas()).extracting(marca -> marca.nome()).containsExactly("Golden");
        assertThatThrownBy(() -> service.cadastrarParaUsuario(ID_USUARIO, ValidacaoDoFornecedorTest.request()
                .marcaIds(golden.getUuid()).build()))
                .isInstanceOf(DadosFornecedorInvalidosException.class)
                .hasMessage("Esta marca está inativa. Escolha uma marca ativa.");
    }

    // ---------- Edicao ----------

    @Test
    void patchSemAsListasMantemRepresentantesEMarcas() {
        Marca golden = marca(1L, null, "Golden");
        Fornecedor fornecedor = existente();
        fornecedor.substituirRepresentantes(List.of(new DadosRepresentante(null, "Ana", null, null)));
        fornecedor.substituirMarcas(List.of(golden.getId()));

        FornecedorResponse resposta = service.atualizarParaUsuario(ID_USUARIO, fornecedor.getUuid(),
                ValidacaoDoFornecedorTest.request().razaoSocial("Distribuidora Nova").build());

        assertThat(resposta.razaoSocial()).isEqualTo("Distribuidora Nova");
        assertThat(resposta.representantes()).extracting(representante -> representante.nome())
                .containsExactly("Ana");
        assertThat(resposta.marcas()).extracting(marca -> marca.nome()).containsExactly("Golden");
    }

    @Test
    void representanteDeOutroFornecedorE404() {
        Fornecedor fornecedor = existente();

        assertThatThrownBy(() -> service.atualizarParaUsuario(ID_USUARIO, fornecedor.getUuid(),
                ValidacaoDoFornecedorTest.request()
                        .representantes(new RepresentanteRequest(UUID.randomUUID(), "Ana", null, null)).build()))
                .isInstanceOf(FornecedorNaoEncontradoException.class)
                .hasMessage("Representante não encontrado.");
    }

    @Test
    void edicaoSemTipoDePessoaMantemOTipoAtual() {
        Fornecedor fornecedor = existente();
        fornecedor.atualizarDados(ValidacaoDoFornecedor.dados(ValidacaoDoFornecedorTest.request()
                .tipoPessoa(TipoPessoaFornecedor.PF).build()));

        FornecedorResponse resposta = service.atualizarParaUsuario(ID_USUARIO, fornecedor.getUuid(),
                ValidacaoDoFornecedorTest.request().documento("111.444.777-35").build());

        assertThat(resposta.tipoPessoa()).isEqualTo(TipoPessoaFornecedor.PF);
    }

    @Test
    void edicaoEExclusaoTravamOFornecedor() {
        Fornecedor fornecedor = existente();

        service.atualizarParaUsuario(ID_USUARIO, fornecedor.getUuid(), ValidacaoDoFornecedorTest.request().build());
        service.excluirParaUsuario(ID_USUARIO, fornecedor.getUuid());

        verify(fornecedorRepository, times(2)).buscarPorUuidParaAtualizar(fornecedor.getUuid(), ID_EMPRESA);
        verify(fornecedorRepository, never()).findByUuidAndEmpresa_Id(any(), any());
    }

    @Test
    void ligarComFornecedorInativoE400AntesDeTocarNoProduto() {
        Fornecedor fornecedor = existente();
        fornecedor.inativar();

        assertThatThrownBy(() -> service.ligarProdutoParaUsuario(ID_USUARIO, fornecedor.getUuid(),
                UUID.randomUUID()))
                .isInstanceOf(DadosFornecedorInvalidosException.class)
                .hasMessage("Este fornecedor está inativo.");
        verify(produtosDoFornecedor, never()).ligar(any(), any(), any());
    }

    @Test
    void documentoDoProprioFornecedorNaoConflita() {
        Fornecedor fornecedor = existente();

        service.atualizarParaUsuario(ID_USUARIO, fornecedor.getUuid(),
                ValidacaoDoFornecedorTest.request().documento(CNPJ).build());

        verify(fornecedorRepository).razaoSocialComDocumento(ID_EMPRESA, CNPJ, fornecedor.getId());
    }

    @Test
    void fornecedorDeOutraEmpresaE404() {
        UUID deOutraEmpresa = UUID.randomUUID();

        assertThatThrownBy(() -> service.buscarParaUsuario(ID_USUARIO, deOutraEmpresa))
                .isInstanceOf(FornecedorNaoEncontradoException.class)
                .hasMessage("Fornecedor não encontrado.");
    }

    // ---------- Exclusao ----------

    @Test
    void exclusaoComProdutosOuEntradasE409ComAsContagens() {
        Fornecedor fornecedor = existente();
        when(produtosDoFornecedor.contar(ID_EMPRESA, fornecedor.getId())).thenReturn(3L);
        when(entradasDoFornecedor.contar(ID_EMPRESA, fornecedor.getId())).thenReturn(0L);

        assertThatThrownBy(() -> service.excluirParaUsuario(ID_USUARIO, fornecedor.getUuid()))
                .isInstanceOf(FornecedorConflitoException.class)
                .hasMessage("Não é possível excluir: o fornecedor tem 3 produto(s) ligados e 0 entrada(s) "
                        + "registradas. Inative-o.");
        verify(fornecedorRepository, never()).delete(any());
    }

    @Test
    void exclusaoSoComEntradasTambemE409() {
        Fornecedor fornecedor = existente();
        when(entradasDoFornecedor.contar(ID_EMPRESA, fornecedor.getId())).thenReturn(2L);

        assertThatThrownBy(() -> service.excluirParaUsuario(ID_USUARIO, fornecedor.getUuid()))
                .isInstanceOf(FornecedorConflitoException.class)
                .hasMessage("Não é possível excluir: o fornecedor tem 0 produto(s) ligados e 2 entrada(s) "
                        + "registradas. Inative-o.");
    }

    @Test
    void exclusaoSemVinculosApaga() {
        Fornecedor fornecedor = existente();

        service.excluirParaUsuario(ID_USUARIO, fornecedor.getUuid());

        verify(fornecedorRepository).delete(fornecedor);
    }

    // ---------- Status ----------

    @Test
    void inativarEReativar() {
        Fornecedor fornecedor = existente();
        lenient().when(produtosDoFornecedor.contar(eq(ID_EMPRESA), anyLong())).thenReturn(0L);

        assertThat(service.inativarParaUsuario(ID_USUARIO, fornecedor.getUuid()).ativo()).isFalse();
        assertThat(service.reativarParaUsuario(ID_USUARIO, fornecedor.getUuid()).ativo()).isTrue();
    }

    // ---------- Apoio ----------

    private Fornecedor existente() {
        Fornecedor fornecedor = new Fornecedor(empresa, 1L, ValidacaoDoFornecedor.dados(
                ValidacaoDoFornecedorTest.request().build()));
        ReflectionTestUtils.setField(fornecedor, "id", 30L);
        lenient().when(fornecedorRepository.findByUuidAndEmpresa_Id(fornecedor.getUuid(), ID_EMPRESA))
                .thenReturn(Optional.of(fornecedor));
        lenient().when(fornecedorRepository.buscarPorUuidParaAtualizar(fornecedor.getUuid(), ID_EMPRESA))
                .thenReturn(Optional.of(fornecedor));
        return fornecedor;
    }

    private Marca marca(Long id, Marca pai, String nome) {
        Marca marca = new Marca(empresa, pai, nome);
        ReflectionTestUtils.setField(marca, "id", id);
        marcasDaEmpresa.add(marca);
        return marca;
    }
}
