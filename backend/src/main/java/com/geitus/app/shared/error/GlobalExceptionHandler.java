package com.geitus.app.shared.error;

import java.util.List;
import java.util.Optional;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.ConflitoDeUsuarioException;
import com.geitus.app.iam.DadosUsuarioInvalidosException;
import com.geitus.app.iam.UsuarioNaoEncontradoException;
import com.geitus.app.cashier.CaixaConflitoException;
import com.geitus.app.cashier.CaixaNaoEncontradoException;
import com.geitus.app.cashier.DadosDoCaixaInvalidosException;
import com.geitus.app.catalog.CatalogoConflitoException;
import com.geitus.app.catalog.CatalogoNaoEncontradoException;
import com.geitus.app.catalog.ProdutoConflitoException;
import com.geitus.app.catalog.ProdutoNaoEncontradoException;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.catalog.imagem.ConferenciaDaImagem;
import com.geitus.app.company.ConflitoDeEmpresaException;
import com.geitus.app.company.DadosEmpresaInvalidosException;
import com.geitus.app.customer.ClienteConflitoException;
import com.geitus.app.customer.ClienteNaoEncontradoException;
import com.geitus.app.customer.DadosClienteInvalidosException;
import com.geitus.app.sales.DadosDaVendaInvalidosException;
import com.geitus.app.sales.ErroDaVenda;
import com.geitus.app.sales.VendaConflitoException;
import com.geitus.app.sales.VendaNaoEncontradaException;
import com.geitus.app.shared.paginacao.PaginacaoInvalidaException;
import com.geitus.app.supplier.DadosFornecedorInvalidosException;
import com.geitus.app.supplier.FornecedorConflitoException;
import com.geitus.app.supplier.FornecedorNaoEncontradoException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;

/**
 * Tratador global de erros da API do Geitus.
 *
 * <p>Padroniza as respostas de erro em JSON usando {@link ApiError}. Nesta base
 * inicial cobre validacao, requisicoes malformadas e erros genericos. Novos
 * tratamentos especificos poderao ser adicionados conforme os modulos surgirem.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    static final String MENSAGEM_ENVIO_GRANDE_DEMAIS = "A imagem enviada é grande demais.";
    static final String MENSAGEM_RECURSO_NAO_ENCONTRADO = "Recurso não encontrado.";
    static final String MENSAGEM_METODO_NAO_PERMITIDO = "Método não permitido para este recurso.";
    static final String MENSAGEM_ACESSO_NEGADO = "Acesso negado.";

    /**
     * Erros de validacao de corpo de requisicao anotado com {@code @Valid}.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> tratarValidacao(MethodArgumentNotValidException ex,
            HttpServletRequest request) {
        List<ApiError.CampoInvalido> campos = ex.getBindingResult().getFieldErrors().stream()
                .map(this::mapearCampo)
                .toList();

        ApiError corpo = ApiError.deValidacao(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                "Um ou mais campos sao invalidos.",
                request.getRequestURI(),
                campos);

        return ResponseEntity.badRequest().body(corpo);
    }

    /**
     * Erros de validacao em parametros (por exemplo, {@code @RequestParam} com restricoes).
     */
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiError> tratarViolacaoRestricao(ConstraintViolationException ex,
            HttpServletRequest request) {
        List<ApiError.CampoInvalido> campos = ex.getConstraintViolations().stream()
                .map(v -> new ApiError.CampoInvalido(
                        v.getPropertyPath() == null ? null : v.getPropertyPath().toString(),
                        v.getMessage()))
                .toList();

        ApiError corpo = ApiError.deValidacao(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                "Um ou mais parametros sao invalidos.",
                request.getRequestURI(),
                campos);

        return ResponseEntity.badRequest().body(corpo);
    }

    /**
     * Requisicao malformada (por exemplo, JSON invalido ou ilegivel).
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> tratarCorpoIlegivel(HttpMessageNotReadableException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                "Requisicao invalida: nao foi possivel ler o corpo enviado.",
                request.getRequestURI());

        return ResponseEntity.badRequest().body(corpo);
    }

    /**
     * Parametro de rota ou de query com tipo incompativel (por exemplo,
     * {@code /api/clientes/abc} ou {@code /api/produtos/abc} com UUID esperado
     * ou {@code ?ativo=talvez}). Responde 400 com mensagem generica:
     * nunca ecoa o valor recebido nem a mensagem tecnica da conversao.
     */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiError> tratarTipoDeParametroInvalido(MethodArgumentTypeMismatchException ex,
            HttpServletRequest request) {
        boolean identificadorDaRota = ex.getParameter().hasParameterAnnotation(PathVariable.class);
        ApiError corpo = ApiError.de(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                identificadorDaRota ? "Identificador inválido." : "Parâmetro inválido.",
                request.getRequestURI());

        return ResponseEntity.badRequest().body(corpo);
    }

    /**
     * Caminho sem nenhuma rota (nem recurso estatico) -> 404 com mensagem fixa,
     * sem ecoar o caminho na mensagem. Antes caia no tratamento generico (500).
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> tratarRecursoNaoEncontrado(NoResourceFoundException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.NOT_FOUND.value(),
                HttpStatus.NOT_FOUND.getReasonPhrase(),
                MENSAGEM_RECURSO_NAO_ENCONTRADO,
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(corpo);
    }

    /**
     * Metodo HTTP que a rota nao tem (por exemplo POST na imagem do produto)
     * -> 405 com mensagem fixa e o cabecalho {@code Allow} com os metodos
     * aceitos. Antes caia no tratamento generico (500).
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiError> tratarMetodoNaoPermitido(HttpRequestMethodNotSupportedException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.METHOD_NOT_ALLOWED.value(),
                HttpStatus.METHOD_NOT_ALLOWED.getReasonPhrase(),
                MENSAGEM_METODO_NAO_PERMITIDO,
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).headers(ex.getHeaders()).body(corpo);
    }

    /**
     * Envio acima do limite do multipart do servidor (512 KB por parte, 1 MB
     * por requisicao; docs/modules/produtos-imagem.md, 4.1) -> 413, com a
     * mensagem da spec e sem os limites internos.
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiError> tratarEnvioGrandeDemais(MaxUploadSizeExceededException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.PAYLOAD_TOO_LARGE.value(),
                HttpStatus.PAYLOAD_TOO_LARGE.getReasonPhrase(),
                MENSAGEM_ENVIO_GRANDE_DEMAIS,
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(corpo);
    }

    /**
     * Parte obrigatoria ausente no multipart, pedido que nao e multipart ou
     * multipart malformado -> 400. Hoje o unico envio multipart e o da imagem
     * do produto, entao a mensagem e a dela (spec 4.1); nunca 500.
     */
    @ExceptionHandler({MissingServletRequestPartException.class, MultipartException.class})
    public ResponseEntity<ApiError> tratarPartesAusentes(Exception ex, HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                ConferenciaDaImagem.MENSAGEM_FALTA_PARTE,
                request.getRequestURI());

        return ResponseEntity.badRequest().body(corpo);
    }

    /**
     * Falha de autenticacao no login (usuario inexistente, senha incorreta ou
     * usuario inativo). Sempre 401 com a MESMA mensagem generica, para nao
     * revelar se um e-mail existe.
     */
    @ExceptionHandler(CredenciaisInvalidasException.class)
    public ResponseEntity<ApiError> tratarCredenciaisInvalidas(CredenciaisInvalidasException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.UNAUTHORIZED.value(),
                HttpStatus.UNAUTHORIZED.getReasonPhrase(),
                "Credenciais inválidas.",
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(corpo);
    }

    /**
     * Perfil sem permissao detectado no service (o perfil do banco, mais novo
     * que o do token; DT-032). Mesmo 403 e mesmo corpo do
     * {@code RestAccessDeniedHandler} do filtro de seguranca; sem este
     * tratamento cairia no generico (500).
     */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> tratarAcessoNegado(AccessDeniedException ex, HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.FORBIDDEN.value(),
                HttpStatus.FORBIDDEN.getReasonPhrase(),
                MENSAGEM_ACESSO_NEGADO,
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(corpo);
    }

    /**
     * Produto nao encontrado para a empresa do usuario autenticado (inclui
     * produto de outra empresa: nos dois casos o comportamento e identico, para
     * nunca vazar dados entre empresas — DEC-016).
     */
    @ExceptionHandler(ProdutoNaoEncontradoException.class)
    public ResponseEntity<ApiError> tratarProdutoNaoEncontrado(ProdutoNaoEncontradoException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.NOT_FOUND.value(),
                HttpStatus.NOT_FOUND.getReasonPhrase(),
                "Produto não encontrado.",
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(corpo);
    }

    /**
     * Violacao de regra de negocio do catalogo com dado invalido (por exemplo,
     * nome vazio, preco/custo/estoque negativo ou ciclo na arvore de
     * categorias) -> 400. Conflitos de
     * unicidade (SKU/codigo de barras duplicado) usam {@code ProdutoConflitoException}
     * e retornam 409. Quando a regra e de um campo, a resposta traz tambem
     * {@code campos}.
     */
    @ExceptionHandler(RegraDeNegocioException.class)
    public ResponseEntity<ApiError> tratarRegraDeNegocio(RegraDeNegocioException ex, HttpServletRequest request) {
        ApiError corpo = erroComCampoOpcional(HttpStatus.BAD_REQUEST, ex.getMessage(), request, ex.campo());
        return ResponseEntity.badRequest().body(corpo);
    }

    /** Pagina ou tamanho fora dos limites das consultas paginadas -> 400 com a mensagem fixa, sem campos. */
    @ExceptionHandler(PaginacaoInvalidaException.class)
    public ResponseEntity<ApiError> tratarPaginacaoInvalida(PaginacaoInvalidaException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI());

        return ResponseEntity.badRequest().body(corpo);
    }

    /**
     * Conflito no modulo Produtos (SKU ou codigo de barras ja usado por outro
     * produto da mesma empresa, ou exclusao de produto com movimentacao).
     * Mapeado para HTTP 409; quando o conflito e de um campo ({@code sku},
     * {@code codigosBarras}), a resposta traz tambem {@code campos}.
     */
    @ExceptionHandler(ProdutoConflitoException.class)
    public ResponseEntity<ApiError> tratarConflitoDeProduto(ProdutoConflitoException ex,
            HttpServletRequest request) {
        ApiError corpo = erroComCampoOpcional(HttpStatus.CONFLICT, ex.getMessage(), request, ex.campo());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(corpo);
    }

    /**
     * Unidade de medida ou categoria nao encontrada para a empresa do usuario
     * (inclui registro de outra empresa — DEC-016). A mensagem e fixa e nao
     * carrega o identificador consultado.
     */
    @ExceptionHandler(CatalogoNaoEncontradoException.class)
    public ResponseEntity<ApiError> tratarCatalogoNaoEncontrado(CatalogoNaoEncontradoException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.NOT_FOUND.value(),
                HttpStatus.NOT_FOUND.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(corpo);
    }

    /**
     * Conflito em unidade de medida ou categoria: sigla/nome entre irmaos
     * repetido, ou exclusao de registro em uso. Mensagens fixas da spec.
     */
    @ExceptionHandler(CatalogoConflitoException.class)
    public ResponseEntity<ApiError> tratarConflitoDeCatalogo(CatalogoConflitoException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.CONFLICT.value(),
                HttpStatus.CONFLICT.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.CONFLICT).body(corpo);
    }

    /**
     * Usuario nao encontrado para a empresa do usuario autenticado (inclui
     * usuario de outra empresa: comportamento identico, para nunca vazar dados
     * entre empresas — DEC-016).
     */
    @ExceptionHandler(UsuarioNaoEncontradoException.class)
    public ResponseEntity<ApiError> tratarUsuarioNaoEncontrado(UsuarioNaoEncontradoException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.NOT_FOUND.value(),
                HttpStatus.NOT_FOUND.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(corpo);
    }

    /**
     * Conflito de estado ou de regra de autoprotecao na gestao de usuarios
     * (e-mail duplicado, ultimo ADMIN ativo, auto-inativacao).
     */
    @ExceptionHandler(ConflitoDeUsuarioException.class)
    public ResponseEntity<ApiError> tratarConflitoDeUsuario(ConflitoDeUsuarioException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.CONFLICT.value(),
                HttpStatus.CONFLICT.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.CONFLICT).body(corpo);
    }

    /**
     * Dados invalidos na gestao de usuarios verificados no service (perfil fora
     * da allow-list, senha abaixo do minimo, senha atual incorreta).
     */
    @ExceptionHandler(DadosUsuarioInvalidosException.class)
    public ResponseEntity<ApiError> tratarDadosUsuarioInvalidos(DadosUsuarioInvalidosException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI());

        return ResponseEntity.badRequest().body(corpo);
    }

    /**
     * Dados invalidos do cadastro da empresa verificados no service (digitos de
     * CPF/CNPJ/telefone, CEP, coerencia PJ/PF, tipo de pessoa).
     */
    @ExceptionHandler(DadosEmpresaInvalidosException.class)
    public ResponseEntity<ApiError> tratarDadosEmpresaInvalidos(DadosEmpresaInvalidosException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI());

        return ResponseEntity.badRequest().body(corpo);
    }

    /**
     * Conflito no cadastro da empresa: CNPJ ja utilizado por outra empresa
     * (constraint {@code uq_empresa_cnpj}).
     */
    @ExceptionHandler(ConflitoDeEmpresaException.class)
    public ResponseEntity<ApiError> tratarConflitoDeEmpresa(ConflitoDeEmpresaException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.CONFLICT.value(),
                HttpStatus.CONFLICT.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.CONFLICT).body(corpo);
    }

    /**
     * Cliente nao encontrado para a empresa do usuario autenticado (inclui
     * cliente de outra empresa: resposta identica, para nunca vazar dados entre
     * empresas — DEC-016).
     */
    @ExceptionHandler(ClienteNaoEncontradoException.class)
    public ResponseEntity<ApiError> tratarClienteNaoEncontrado(ClienteNaoEncontradoException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.NOT_FOUND.value(),
                HttpStatus.NOT_FOUND.getReasonPhrase(),
                "Cliente não encontrado.",
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(corpo);
    }

    /**
     * Conflito no cadastro de clientes: CPF ja usado por outro cliente da mesma
     * empresa (DEC-026). A mensagem do service nunca inclui o CPF.
     */
    @ExceptionHandler(ClienteConflitoException.class)
    public ResponseEntity<ApiError> tratarConflitoDeCliente(ClienteConflitoException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.CONFLICT.value(),
                HttpStatus.CONFLICT.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.CONFLICT).body(corpo);
    }

    /**
     * Dados de cliente invalidos verificados no service (nome ausente,
     * CPF/telefone/WhatsApp invalidos). Mensagens fixas, sem eco do valor.
     */
    @ExceptionHandler(DadosClienteInvalidosException.class)
    public ResponseEntity<ApiError> tratarDadosClienteInvalidos(DadosClienteInvalidosException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI());

        return ResponseEntity.badRequest().body(corpo);
    }

    /**
     * Fornecedor (ou representante) nao encontrado na empresa do usuario,
     * inclusive o de outra empresa: resposta identica (DEC-016). Mensagem fixa.
     */
    @ExceptionHandler(FornecedorNaoEncontradoException.class)
    public ResponseEntity<ApiError> tratarFornecedorNaoEncontrado(FornecedorNaoEncontradoException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.NOT_FOUND.value(),
                HttpStatus.NOT_FOUND.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(corpo);
    }

    /** Dado invalido no cadastro do fornecedor (spec 4.6), com o campo quando houver. */
    @ExceptionHandler(DadosFornecedorInvalidosException.class)
    public ResponseEntity<ApiError> tratarDadosFornecedorInvalidos(DadosFornecedorInvalidosException ex,
            HttpServletRequest request) {
        ApiError corpo = erroComCampoOpcional(HttpStatus.BAD_REQUEST, ex.getMessage(), request, ex.campo());
        return ResponseEntity.badRequest().body(corpo);
    }

    /** Documento repetido ou exclusao de fornecedor com vinculos (409), com o campo quando houver. */
    @ExceptionHandler(FornecedorConflitoException.class)
    public ResponseEntity<ApiError> tratarConflitoDeFornecedor(FornecedorConflitoException ex,
            HttpServletRequest request) {
        ApiError corpo = erroComCampoOpcional(HttpStatus.CONFLICT, ex.getMessage(), request, ex.campo());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(corpo);
    }

    /**
     * Ponto ou sessao de caixa nao encontrado na empresa do usuario, inclusive
     * o de outra empresa e, para o OPERADOR, a sessao de outra pessoa: resposta
     * identica (DEC-016; docs/modules/caixa.md, 5.2). Mensagem fixa.
     */
    @ExceptionHandler(CaixaNaoEncontradoException.class)
    public ResponseEntity<ApiError> tratarCaixaNaoEncontrado(CaixaNaoEncontradoException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.NOT_FOUND.value(),
                HttpStatus.NOT_FOUND.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(corpo);
    }

    /** Conflito com o estado do caixa (409), com o campo quando houver. */
    @ExceptionHandler(CaixaConflitoException.class)
    public ResponseEntity<ApiError> tratarConflitoDeCaixa(CaixaConflitoException ex, HttpServletRequest request) {
        ApiError corpo = erroComCampoOpcional(HttpStatus.CONFLICT, ex.getMessage(), request, ex.campo());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(corpo);
    }

    /** Dado invalido no caixa verificado no service (400), com o campo quando houver. */
    @ExceptionHandler(DadosDoCaixaInvalidosException.class)
    public ResponseEntity<ApiError> tratarDadosDoCaixaInvalidos(DadosDoCaixaInvalidosException ex,
            HttpServletRequest request) {
        ApiError corpo = erroComCampoOpcional(HttpStatus.BAD_REQUEST, ex.getMessage(), request, ex.campo());
        return ResponseEntity.badRequest().body(corpo);
    }

    /** Regra do carrinho ou da venda violada (400), com todos os campos (docs/modules/pdv.md, 5.4). */
    @ExceptionHandler(DadosDaVendaInvalidosException.class)
    public ResponseEntity<ApiError> tratarDadosDaVendaInvalidos(DadosDaVendaInvalidosException ex,
            HttpServletRequest request) {
        return erroDaVenda(HttpStatus.BAD_REQUEST, ex, request);
    }

    /** Recurso do PDV inexistente na empresa (404), com o campo do carrinho quando veio dele. */
    @ExceptionHandler(VendaNaoEncontradaException.class)
    public ResponseEntity<ApiError> tratarVendaNaoEncontrada(VendaNaoEncontradaException ex,
            HttpServletRequest request) {
        return erroDaVenda(HttpStatus.NOT_FOUND, ex, request);
    }

    /** Conflito com o estado atual no PDV (409), com os campos quando houver. */
    @ExceptionHandler(VendaConflitoException.class)
    public ResponseEntity<ApiError> tratarConflitoDeVenda(VendaConflitoException ex, HttpServletRequest request) {
        return erroDaVenda(HttpStatus.CONFLICT, ex, request);
    }

    /**
     * Violacao de integridade do banco (constraint UNIQUE, FK, CHECK). Fecha a
     * janela de corrida TOCTOU (DT-015): mesmo que duas requisicoes concorrentes
     * passem pela checagem de unicidade em memoria, a constraint do banco garante
     * a integridade e o erro chega aqui. Responde 409 com mensagem generica, sem
     * vazar detalhe do banco (nome de constraint, SQL, etc.).
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> tratarViolacaoIntegridade(DataIntegrityViolationException ex,
            HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.CONFLICT.value(),
                HttpStatus.CONFLICT.getReasonPhrase(),
                "Registro em conflito com dados já existentes.",
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.CONFLICT).body(corpo);
    }

    /**
     * Qualquer erro nao previsto: resposta generica sem vazar detalhes internos.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> tratarGenerico(Exception ex, HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                HttpStatus.INTERNAL_SERVER_ERROR.getReasonPhrase(),
                "Ocorreu um erro inesperado. Tente novamente mais tarde.",
                request.getRequestURI());

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(corpo);
    }

    /**
     * Erro com a mensagem da regra; se a regra for de um campo, inclui
     * {@code campos: [{campo, mensagem}]} com a mesma mensagem (contrato
     * aditivo: quem so le {@code mensagem} nao muda).
     */
    private static ApiError erroComCampoOpcional(HttpStatus status, String mensagem, HttpServletRequest request,
            Optional<String> campo) {
        if (campo.isEmpty()) {
            return ApiError.de(status.value(), status.getReasonPhrase(), mensagem, request.getRequestURI());
        }
        return ApiError.deValidacao(status.value(), status.getReasonPhrase(), mensagem, request.getRequestURI(),
                List.of(new ApiError.CampoInvalido(campo.get(), mensagem)));
    }

    /** A primeira mensagem e, se algum erro tem campo, {@code campos} com todos os que tem. */
    private static ResponseEntity<ApiError> erroDaVenda(HttpStatus status, ErroDaVenda ex,
            HttpServletRequest request) {
        List<ApiError.CampoInvalido> campos = ex.erros().stream()
                .filter(erro -> erro.campo() != null)
                .map(erro -> new ApiError.CampoInvalido(erro.campo(), erro.mensagem()))
                .toList();
        ApiError corpo = campos.isEmpty()
                ? ApiError.de(status.value(), status.getReasonPhrase(), ex.getMessage(), request.getRequestURI())
                : ApiError.deValidacao(status.value(), status.getReasonPhrase(), ex.getMessage(),
                        request.getRequestURI(), campos);
        return ResponseEntity.status(status).body(corpo);
    }

    private ApiError.CampoInvalido mapearCampo(FieldError erro) {
        return new ApiError.CampoInvalido(erro.getField(), erro.getDefaultMessage());
    }
}
