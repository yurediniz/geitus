package com.geitus.app.customer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.shared.numeracao.Numerador;
import com.geitus.app.shared.numeracao.TipoNumeracao;

/**
 * Testa as regras do {@link ClienteService}: normalizacao antes de validar e de
 * checar unicidade, CPF unico por empresa, WhatsApp derivado, montagem dos
 * padroes de busca e isolamento por empresa (DEC-016).
 */
@ExtendWith(MockitoExtension.class)
class ClienteServiceTest {

    private static final Long ID_USUARIO = 1L;
    private static final Long ID_EMPRESA = 7L;
    private static final Long ID_CLIENTE = 42L;
    private static final String CPF_VALIDO = "11144477735";
    private static final String CPF_VALIDO_MASCARADO = "111.444.777-35";
    private static final String OUTRO_CPF_VALIDO = "52998224725";
    private static final String MENSAGEM_CPF_DUPLICADO = "Já existe um cliente com este CPF nesta empresa.";

    @Mock
    private ClienteRepository clienteRepository;

    @Mock
    private EmpresaRepository empresaRepository;

    @Mock
    private UsuarioRepository usuarioRepository;

    @Mock
    private Numerador numerador;

    @InjectMocks
    private ClienteService clienteService;

    // ---------- Helpers ----------

    private Empresa empresaComId(Long id) {
        Empresa empresa = new Empresa("Empresa " + id);
        ReflectionTestUtils.setField(empresa, "id", id);
        return empresa;
    }

    private Empresa usuarioAtivoDaEmpresa() {
        Empresa empresa = empresaComId(ID_EMPRESA);
        Usuario usuario = new Usuario(empresa, "Operador", "operador@geitus.com", "hash", "OPERADOR");
        when(usuarioRepository.findById(ID_USUARIO)).thenReturn(Optional.of(usuario));
        return empresa;
    }

    private void prepararCadastro() {
        Empresa empresa = usuarioAtivoDaEmpresa();
        when(empresaRepository.findById(ID_EMPRESA)).thenReturn(Optional.of(empresa));
        when(clienteRepository.save(any(Cliente.class))).thenAnswer(invocacao -> invocacao.getArgument(0));
    }

    private Cliente clienteExistente(String cpf, boolean telefoneEWhatsapp, String whatsapp) {
        Empresa empresa = usuarioAtivoDaEmpresa();
        Cliente cliente = new Cliente(empresa, 12L, "Ana", cpf, "11987654321", telefoneEWhatsapp, whatsapp, null);
        ReflectionTestUtils.setField(cliente, "id", ID_CLIENTE);
        when(clienteRepository.findByUuidAndEmpresa_Id(cliente.getUuid(), ID_EMPRESA))
                .thenReturn(Optional.of(cliente));
        return cliente;
    }

    private void salvarDevolveArgumento() {
        when(clienteRepository.save(any(Cliente.class))).thenAnswer(invocacao -> invocacao.getArgument(0));
    }

    private static DadosCliente dados(String nome, String cpf, String telefone, Boolean telefoneEWhatsapp,
            String whatsapp) {
        return new DadosCliente(nome, cpf, telefone, telefoneEWhatsapp, whatsapp, null);
    }

    // ---------- Cadastro ----------

    @Test
    void cadastrarNormalizaCamposAntesDeSalvar() {
        prepararCadastro();
        DadosCliente entrada = new DadosCliente(" Ana ", CPF_VALIDO_MASCARADO, "(11) 98765-4321", null,
                "(11) 91234-5678", "  ");

        Cliente cliente = clienteService.cadastrarParaUsuario(ID_USUARIO, entrada);

        assertThat(cliente.getNome()).isEqualTo("Ana");
        assertThat(cliente.getCpf()).isEqualTo(CPF_VALIDO);
        assertThat(cliente.getTelefone()).isEqualTo("11987654321");
        assertThat(cliente.isTelefoneEWhatsapp()).isTrue();
        assertThat(cliente.getWhatsapp()).isNull();
        assertThat(cliente.getObservacoes()).isNull();
        assertThat(cliente.getEmpresaId()).isEqualTo(ID_EMPRESA);
        assertThat(cliente.isAtivo()).isTrue();
        verify(clienteRepository).save(cliente);
    }

    @Test
    void cadastrarComCpfMascaradoJaExistenteLancaConflito() {
        usuarioAtivoDaEmpresa();
        when(clienteRepository.existsByCpfAndEmpresa_Id(CPF_VALIDO, ID_EMPRESA)).thenReturn(true);

        assertThatThrownBy(() -> clienteService.cadastrarParaUsuario(ID_USUARIO,
                dados("Ana", CPF_VALIDO_MASCARADO, null, null, null)))
                .isInstanceOf(ClienteConflitoException.class)
                .hasMessage(MENSAGEM_CPF_DUPLICADO);

        verify(clienteRepository, never()).save(any());
    }

    @Test
    void cadastrarSemCpfNaoConsultaUnicidade() {
        prepararCadastro();

        Cliente cliente = clienteService.cadastrarParaUsuario(ID_USUARIO, dados("Ana", "", null, null, null));

        assertThat(cliente.getCpf()).isNull();
        verify(clienteRepository, never()).existsByCpfAndEmpresa_Id(any(), any());
    }

    @Test
    void cadastrarComCpfInvalidoLancaDadosInvalidos() {
        usuarioAtivoDaEmpresa();

        assertThatThrownBy(() -> clienteService.cadastrarParaUsuario(ID_USUARIO,
                dados("Ana", "11111111111", null, null, null)))
                .isInstanceOf(DadosClienteInvalidosException.class)
                .hasMessage("CPF inválido.");

        verify(clienteRepository, never()).save(any());
    }

    @Test
    void cadastrarComNomeEmBrancoLancaDadosInvalidos() {
        usuarioAtivoDaEmpresa();

        assertThatThrownBy(() -> clienteService.cadastrarParaUsuario(ID_USUARIO,
                dados("   ", null, null, null, null)))
                .isInstanceOf(DadosClienteInvalidosException.class)
                .hasMessage("Nome do cliente é obrigatório.");

        verify(clienteRepository, never()).save(any());
    }

    @Test
    void cadastrarComTelefoneInvalidoLancaDadosInvalidos() {
        usuarioAtivoDaEmpresa();

        assertThatThrownBy(() -> clienteService.cadastrarParaUsuario(ID_USUARIO,
                dados("Ana", null, "(01) 2345-678", null, null)))
                .isInstanceOf(DadosClienteInvalidosException.class)
                .hasMessage("Telefone inválido.");

        verify(clienteRepository, never()).save(any());
    }

    @Test
    void cadastrarComWhatsappProprioInvalidoLancaDadosInvalidos() {
        usuarioAtivoDaEmpresa();

        assertThatThrownBy(() -> clienteService.cadastrarParaUsuario(ID_USUARIO,
                dados("Ana", null, null, false, "123")))
                .isInstanceOf(DadosClienteInvalidosException.class)
                .hasMessage("WhatsApp inválido.");

        verify(clienteRepository, never()).save(any());
    }

    @Test
    void cadastrarComWhatsappProprioGuardaONumero() {
        prepararCadastro();

        Cliente cliente = clienteService.cadastrarParaUsuario(ID_USUARIO,
                dados("Ana", null, "(11) 98765-4321", false, "(11) 91234-5678"));

        assertThat(cliente.isTelefoneEWhatsapp()).isFalse();
        assertThat(cliente.getWhatsapp()).isEqualTo("11912345678");
        assertThat(cliente.getWhatsappResolvido()).isEqualTo("11912345678");
    }

    @Test
    void cadastrarComTelefoneEWhatsappDescartaWhatsappSemValidar() {
        prepararCadastro();

        Cliente cliente = clienteService.cadastrarParaUsuario(ID_USUARIO,
                dados("Ana", null, "(11) 98765-4321", true, "123"));

        assertThat(cliente.getWhatsapp()).isNull();
        assertThat(cliente.getWhatsappResolvido()).isEqualTo("11987654321");
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(booleans = true)
    void cadastrarComTelefoneEWhatsappSemTelefoneResolveWhatsappNulo(Boolean telefoneEWhatsapp) {
        // Sem telefone, "o telefone e WhatsApp" nao produz numero algum: nada
        // e inventado e o WhatsApp informado continua descartado.
        prepararCadastro();

        Cliente cliente = clienteService.cadastrarParaUsuario(ID_USUARIO,
                dados("Ana", null, null, telefoneEWhatsapp, "(11) 91234-5678"));

        assertThat(cliente.getTelefone()).isNull();
        assertThat(cliente.getWhatsapp()).isNull();
        assertThat(cliente.getWhatsappResolvido()).isNull();
    }

    @Test
    void whatsappIgualAoTelefoneViraTelefoneEWhatsapp() {
        // "Cadastrar uma vez": o mesmo numero nao e gravado duas vezes, mesmo
        // que digitado com mascaras diferentes.
        prepararCadastro();

        Cliente cliente = clienteService.cadastrarParaUsuario(ID_USUARIO,
                dados("Ana", null, "(11) 98765-4321", false, "11 98765 4321"));

        assertThat(cliente.isTelefoneEWhatsapp()).isTrue();
        assertThat(cliente.getWhatsapp()).isNull();
        assertThat(cliente.getWhatsappResolvido()).isEqualTo("11987654321");
    }

    // ---------- Atualizacao ----------

    @Test
    void atualizarMarcandoTelefoneEWhatsappLimpaWhatsappProprio() {
        Cliente cliente = clienteExistente(null, false, "11912345678");
        salvarDevolveArgumento();

        Cliente atualizado = clienteService.atualizarParaUsuario(ID_USUARIO, cliente.getUuid(),
                dados("Ana", null, "11987654321", true, "11912345678"));

        assertThat(atualizado.isTelefoneEWhatsapp()).isTrue();
        assertThat(atualizado.getWhatsapp()).isNull();
        assertThat(atualizado.getWhatsappResolvido()).isEqualTo("11987654321");
    }

    @Test
    void atualizarApagandoCpfGravaNulo() {
        Cliente cliente = clienteExistente(CPF_VALIDO, true, null);
        salvarDevolveArgumento();

        Cliente atualizado = clienteService.atualizarParaUsuario(ID_USUARIO, cliente.getUuid(),
                dados("Ana", "", "11987654321", true, null));

        assertThat(atualizado.getCpf()).isNull();
        verify(clienteRepository, never()).existsByCpfAndEmpresa_IdAndIdNot(any(), any(), any());
    }

    @Test
    void atualizarComCpfDeOutroClienteLancaConflito() {
        Cliente cliente = clienteExistente(CPF_VALIDO, true, null);
        when(clienteRepository.existsByCpfAndEmpresa_IdAndIdNot(OUTRO_CPF_VALIDO, ID_EMPRESA, ID_CLIENTE))
                .thenReturn(true);

        assertThatThrownBy(() -> clienteService.atualizarParaUsuario(ID_USUARIO, cliente.getUuid(),
                dados("Ana", "529.982.247-25", null, null, null)))
                .isInstanceOf(ClienteConflitoException.class)
                .hasMessage(MENSAGEM_CPF_DUPLICADO);

        verify(clienteRepository, never()).save(any());
        verify(clienteRepository, never()).existsByCpfAndEmpresa_Id(any(), any());
    }

    @Test
    void atualizarMantendoOProprioCpfNaoConflita() {
        Cliente cliente = clienteExistente(CPF_VALIDO, true, null);
        when(clienteRepository.existsByCpfAndEmpresa_IdAndIdNot(CPF_VALIDO, ID_EMPRESA, ID_CLIENTE))
                .thenReturn(false);
        salvarDevolveArgumento();

        Cliente atualizado = clienteService.atualizarParaUsuario(ID_USUARIO, cliente.getUuid(),
                dados("Ana Souza", CPF_VALIDO_MASCARADO, null, null, null));

        assertThat(atualizado.getNome()).isEqualTo("Ana Souza");
        assertThat(atualizado.getCpf()).isEqualTo(CPF_VALIDO);
    }

    // ---------- Busca por id, inativar e reativar ----------

    @Test
    void buscarClienteDeOutraEmpresaLancaNaoEncontrado() {
        usuarioAtivoDaEmpresa();
        UUID uuidDeOutraEmpresa = UUID.randomUUID();
        when(clienteRepository.findByUuidAndEmpresa_Id(uuidDeOutraEmpresa, ID_EMPRESA))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> clienteService.buscarParaUsuario(ID_USUARIO, uuidDeOutraEmpresa))
                .isInstanceOf(ClienteNaoEncontradoException.class);
    }

    @Test
    void inativarEReativarAlternamStatus() {
        Cliente cliente = clienteExistente(null, true, null);
        salvarDevolveArgumento();

        assertThat(clienteService.inativarParaUsuario(ID_USUARIO, cliente.getUuid()).isAtivo()).isFalse();
        assertThat(clienteService.reativarParaUsuario(ID_USUARIO, cliente.getUuid()).isAtivo()).isTrue();
    }

    // ---------- Listagem e montagem dos padroes de busca ----------

    @Test
    void listarSemBuscaUsaBuscarPorEmpresa() {
        usuarioAtivoDaEmpresa();
        when(clienteRepository.buscarPorEmpresa(ID_EMPRESA, true)).thenReturn(List.of());

        clienteService.listarParaUsuario(ID_USUARIO, "   ", true);

        verify(clienteRepository).buscarPorEmpresa(ID_EMPRESA, true);
    }

    @Test
    void listarComTermoSemDigitosUsaBuscarPorNome() {
        usuarioAtivoDaEmpresa();
        when(clienteRepository.buscarPorNome(ID_EMPRESA, "%ana%", null)).thenReturn(List.of());

        clienteService.listarParaUsuario(ID_USUARIO, " Ana ", null);

        verify(clienteRepository).buscarPorNome(ID_EMPRESA, "%ana%", null);
    }

    @Test
    void listarComTermoComDigitosUsaBuscarPorNomeOuDigitos() {
        usuarioAtivoDaEmpresa();
        when(clienteRepository.buscarPorNomeOuDigitos(ID_EMPRESA, "%(11) 98765%", "%1198765%", null))
                .thenReturn(List.of());

        clienteService.listarParaUsuario(ID_USUARIO, "(11) 98765", null);

        verify(clienteRepository).buscarPorNomeOuDigitos(ID_EMPRESA, "%(11) 98765%", "%1198765%", null);
    }

    @Test
    void listarEscapaCuringas() {
        // "100%_x" tem digitos, entao vai para buscarPorNomeOuDigitos; o que
        // importa aqui e o padrao de nome com '%' e '_' escapados.
        usuarioAtivoDaEmpresa();
        when(clienteRepository.buscarPorNomeOuDigitos(ID_EMPRESA, "%100\\%\\_x%", "%100%", null))
                .thenReturn(List.of());

        clienteService.listarParaUsuario(ID_USUARIO, "100%_x", null);

        verify(clienteRepository).buscarPorNomeOuDigitos(ID_EMPRESA, "%100\\%\\_x%", "%100%", null);
    }

    @Test
    void listarEscapaBarraInvertidaAntesDosCuringas() {
        // Termo x\% : a barra e escapada primeiro (\\), depois o % (\%).
        usuarioAtivoDaEmpresa();
        when(clienteRepository.buscarPorNome(ID_EMPRESA, "%x\\\\\\%%", null)).thenReturn(List.of());

        clienteService.listarParaUsuario(ID_USUARIO, "x\\%", null);

        verify(clienteRepository).buscarPorNome(ID_EMPRESA, "%x\\\\\\%%", null);
    }

    // ---------- Resolucao da empresa a partir do usuario autenticado ----------

    @Test
    void usuarioInativoLancaCredenciaisInvalidas() {
        Usuario usuarioInativo = Mockito.mock(Usuario.class);
        when(usuarioInativo.isAtivo()).thenReturn(false);
        when(usuarioRepository.findById(ID_USUARIO)).thenReturn(Optional.of(usuarioInativo));

        assertThatThrownBy(() -> clienteService.cadastrarParaUsuario(ID_USUARIO,
                dados("Ana", null, null, null, null)))
                .isInstanceOf(CredenciaisInvalidasException.class);

        verify(clienteRepository, never()).save(any());
    }

    // ---------- Fase B2: numero de registro ----------

    @Test
    void clienteRecebeNumeroNaCriacao() {
        prepararCadastro();
        when(numerador.proximo(ID_EMPRESA, TipoNumeracao.CLIENTE)).thenReturn(12L);

        Cliente cliente = clienteService.cadastrarParaUsuario(ID_USUARIO, dados("Ana", null, null, null, null));

        assertThat(cliente.getNumero()).isEqualTo(12L);
    }

    /** O CPF repetido e recusado antes de reservar o numero: nenhum numero e consumido. */
    @Test
    void cadastroRecusadoNaoReservaNumero() {
        usuarioAtivoDaEmpresa();
        when(clienteRepository.existsByCpfAndEmpresa_Id(CPF_VALIDO, ID_EMPRESA)).thenReturn(true);

        assertThatThrownBy(() -> clienteService.cadastrarParaUsuario(ID_USUARIO,
                dados("Ana", CPF_VALIDO, null, null, null)))
                .isInstanceOf(ClienteConflitoException.class);

        verifyNoInteractions(numerador);
    }

    @Test
    void edicaoNaoMudaONumeroDoCliente() {
        Cliente cliente = clienteExistente(null, true, null);
        salvarDevolveArgumento();

        Cliente atualizado = clienteService.atualizarParaUsuario(ID_USUARIO, cliente.getUuid(),
                dados("Ana Maria", null, null, null, null));

        assertThat(atualizado.getNumero()).isEqualTo(12L);
        verifyNoInteractions(numerador);
    }
}
