package com.geitus.app.customer;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.geitus.app.company.Empresa;
import com.geitus.app.company.EmpresaRepository;
import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.Usuario;
import com.geitus.app.iam.UsuarioRepository;
import com.geitus.app.shared.busca.PadraoLike;
import com.geitus.app.shared.numeracao.Numerador;
import com.geitus.app.shared.numeracao.TipoNumeracao;
import com.geitus.app.shared.validation.Documentos;
import com.geitus.app.shared.validation.Telefones;

/**
 * Regras de negocio do modulo Clientes (docs/modules/clientes.md).
 *
 * <p>Mesmo desenho do {@code ProdutoService}: a API publica e composta apenas
 * pelos metodos {@code *ParaUsuario}, que recebem o {@code idUsuario} do JWT e
 * resolvem a empresa internamente; os metodos por {@code empresaId} sao
 * package-private e concentram o isolamento por tenant (DEC-016). Cliente de
 * outra empresa e tratado como inexistente.
 *
 * <p>Os dados chegam crus ({@link DadosCliente}) e sao normalizados ANTES de
 * qualquer validacao ou checagem de unicidade: assim um CPF digitado com
 * mascara e comparado com o valor gravado (so digitos) e nao escapa da
 * unicidade por empresa.
 *
 * <p>CPF e dado pessoal: este service nao loga e nao inclui o CPF em mensagens.
 */
@Service
public class ClienteService {

    static final String MENSAGEM_CPF_DUPLICADO = "Já existe um cliente com este CPF nesta empresa.";
    static final String MENSAGEM_NOME_OBRIGATORIO = "Nome do cliente é obrigatório.";
    static final String MENSAGEM_CPF_INVALIDO = "CPF inválido.";
    static final String MENSAGEM_TELEFONE_INVALIDO = "Telefone inválido.";
    static final String MENSAGEM_WHATSAPP_INVALIDO = "WhatsApp inválido.";

    private final ClienteRepository clienteRepository;
    private final EmpresaRepository empresaRepository;
    private final UsuarioRepository usuarioRepository;
    private final Numerador numerador;

    public ClienteService(ClienteRepository clienteRepository, EmpresaRepository empresaRepository,
            UsuarioRepository usuarioRepository, Numerador numerador) {
        this.clienteRepository = clienteRepository;
        this.empresaRepository = empresaRepository;
        this.usuarioRepository = usuarioRepository;
        this.numerador = numerador;
    }

    // ---------- API publica (empresa sempre resolvida do usuario do JWT) ----------

    @Transactional(readOnly = true)
    public List<Cliente> listarParaUsuario(Long idUsuario, String busca, Boolean ativo) {
        return listar(resolverEmpresaId(idUsuario), busca, ativo);
    }

    @Transactional(readOnly = true)
    public Cliente buscarParaUsuario(Long idUsuario, UUID id) {
        return buscar(resolverEmpresaId(idUsuario), id);
    }

    @Transactional
    public Cliente cadastrarParaUsuario(Long idUsuario, DadosCliente dados) {
        return cadastrar(resolverEmpresaId(idUsuario), dados);
    }

    @Transactional
    public Cliente atualizarParaUsuario(Long idUsuario, UUID id, DadosCliente dados) {
        return atualizar(resolverEmpresaId(idUsuario), id, dados);
    }

    @Transactional
    public Cliente inativarParaUsuario(Long idUsuario, UUID id) {
        return inativar(resolverEmpresaId(idUsuario), id);
    }

    @Transactional
    public Cliente reativarParaUsuario(Long idUsuario, UUID id) {
        return reativar(resolverEmpresaId(idUsuario), id);
    }

    // ---------- Regras por empresa (uso interno) ----------

    /**
     * O numero de registro e reservado so depois das validacoes, na mesma
     * transacao do INSERT: se o cadastro falhar, o rollback devolve o numero.
     */
    Cliente cadastrar(Long empresaId, DadosCliente dados) {
        DadosNormalizados normalizados = normalizarEValidar(dados);
        garantirCpfDisponivelParaNovoCliente(empresaId, normalizados.cpf());

        Empresa empresa = empresaRepository.findById(empresaId)
                .orElseThrow(CredenciaisInvalidasException::new);
        long numero = numerador.proximo(empresaId, TipoNumeracao.CLIENTE);
        Cliente cliente = new Cliente(empresa, numero, normalizados.nome(), normalizados.cpf(),
                normalizados.telefone(), normalizados.telefoneEWhatsapp(), normalizados.whatsapp(),
                normalizados.observacoes());
        return clienteRepository.save(cliente);
    }

    Cliente atualizar(Long empresaId, UUID id, DadosCliente dados) {
        Cliente cliente = buscar(empresaId, id);
        DadosNormalizados normalizados = normalizarEValidar(dados);
        garantirCpfDisponivelParaClienteExistente(empresaId, cliente.getId(), normalizados.cpf());

        cliente.atualizarDados(normalizados.nome(), normalizados.cpf(), normalizados.telefone(),
                normalizados.telefoneEWhatsapp(), normalizados.whatsapp(), normalizados.observacoes());
        return clienteRepository.save(cliente);
    }

    Cliente inativar(Long empresaId, UUID id) {
        Cliente cliente = buscar(empresaId, id);
        cliente.inativar();
        return clienteRepository.save(cliente);
    }

    Cliente reativar(Long empresaId, UUID id) {
        Cliente cliente = buscar(empresaId, id);
        cliente.ativar();
        return clienteRepository.save(cliente);
    }

    Cliente buscar(Long empresaId, UUID id) {
        return clienteRepository.findByUuidAndEmpresa_Id(id, empresaId)
                .orElseThrow(ClienteNaoEncontradoException::new);
    }

    /**
     * Lista os clientes da empresa. Sem termo, usa a query sem padrao; com
     * termo, busca no nome e — se o termo tiver digitos — tambem em
     * CPF/telefone/WhatsApp pelos digitos (mascara ignorada). Os padroes nunca
     * sao {@code null} (ver nota no {@link ClienteRepository}).
     */
    List<Cliente> listar(Long empresaId, String busca, Boolean ativo) {
        if (!StringUtils.hasText(busca)) {
            return clienteRepository.buscarPorEmpresa(empresaId, ativo);
        }
        String padraoNome = PadraoLike.contem(busca.trim().toLowerCase(Locale.ROOT));
        String digitos = Documentos.somenteDigitos(busca);
        if (digitos.isEmpty()) {
            return clienteRepository.buscarPorNome(empresaId, padraoNome, ativo);
        }
        return clienteRepository.buscarPorNomeOuDigitos(empresaId, padraoNome, PadraoLike.contem(digitos), ativo);
    }

    // ---------- Normalizacao e validacao ----------

    /** Dados ja limpos e validados, prontos para a entidade. */
    private record DadosNormalizados(String nome, String cpf, String telefone, boolean telefoneEWhatsapp,
            String whatsapp, String observacoes) {
    }

    /**
     * Normaliza (trim, vazio vira {@code null}, documentos so com digitos) e
     * valida. Com {@code telefoneEWhatsapp} efetivo, o {@code whatsapp}
     * recebido e descartado sem validar: o WhatsApp passa a ser o proprio
     * telefone e a coluna precisa ficar {@code null} (CHECK
     * {@code ck_cliente_whatsapp_coerente}).
     *
     * <p>Um WhatsApp "proprio" igual ao telefone (apos normalizar) tambem vira
     * {@code telefoneEWhatsapp = true}: o numero e cadastrado uma vez so.
     */
    private DadosNormalizados normalizarEValidar(DadosCliente dados) {
        String nome = textoOuNulo(dados.nome());
        if (nome == null) {
            throw new DadosClienteInvalidosException(MENSAGEM_NOME_OBRIGATORIO);
        }
        String cpf = cpfNormalizado(dados.cpf());
        String telefone = telefoneNormalizado(dados.telefone(), MENSAGEM_TELEFONE_INVALIDO);
        boolean telefoneEWhatsapp = !Boolean.FALSE.equals(dados.telefoneEWhatsapp());
        String whatsapp = telefoneEWhatsapp ? null
                : telefoneNormalizado(dados.whatsapp(), MENSAGEM_WHATSAPP_INVALIDO);
        if (whatsapp != null && whatsapp.equals(telefone)) {
            telefoneEWhatsapp = true;
            whatsapp = null;
        }
        return new DadosNormalizados(nome, cpf, telefone, telefoneEWhatsapp, whatsapp,
                textoOuNulo(dados.observacoes()));
    }

    /** CPF so com digitos, ou {@code null} se nao informado. Texto sem CPF valido e rejeitado. */
    private String cpfNormalizado(String cpf) {
        if (textoOuNulo(cpf) == null) {
            return null;
        }
        if (!Documentos.cpfValido(cpf)) {
            throw new DadosClienteInvalidosException(MENSAGEM_CPF_INVALIDO);
        }
        return Documentos.somenteDigitos(cpf);
    }

    /** Telefone so com digitos, ou {@code null} se nao informado. Texto sem telefone valido e rejeitado. */
    private String telefoneNormalizado(String telefone, String mensagemSeInvalido) {
        if (textoOuNulo(telefone) == null) {
            return null;
        }
        if (!Telefones.valido(telefone)) {
            throw new DadosClienteInvalidosException(mensagemSeInvalido);
        }
        return Telefones.somenteDigitos(telefone);
    }

    private String textoOuNulo(String valor) {
        return StringUtils.hasText(valor) ? valor.trim() : null;
    }

    private void garantirCpfDisponivelParaNovoCliente(Long empresaId, String cpf) {
        if (cpf != null && clienteRepository.existsByCpfAndEmpresa_Id(cpf, empresaId)) {
            throw new ClienteConflitoException(MENSAGEM_CPF_DUPLICADO);
        }
    }

    private void garantirCpfDisponivelParaClienteExistente(Long empresaId, Long clienteId, String cpf) {
        if (cpf != null && clienteRepository.existsByCpfAndEmpresa_IdAndIdNot(cpf, empresaId, clienteId)) {
            throw new ClienteConflitoException(MENSAGEM_CPF_DUPLICADO);
        }
    }

    // ---------- Resolucao da empresa ----------

    private Long resolverEmpresaId(Long idUsuario) {
        Usuario usuario = usuarioRepository.findById(idUsuario)
                .filter(Usuario::isAtivo)
                .orElseThrow(CredenciaisInvalidasException::new);
        return usuario.getEmpresaId();
    }
}
