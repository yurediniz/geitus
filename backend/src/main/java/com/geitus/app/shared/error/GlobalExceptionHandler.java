package com.geitus.app.shared.error;

import java.util.List;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.geitus.app.iam.CredenciaisInvalidasException;
import com.geitus.app.iam.ConflitoDeUsuarioException;
import com.geitus.app.iam.DadosUsuarioInvalidosException;
import com.geitus.app.iam.UsuarioNaoEncontradoException;
import com.geitus.app.catalog.ProdutoConflitoException;
import com.geitus.app.catalog.ProdutoNaoEncontradoException;
import com.geitus.app.catalog.RegraDeNegocioException;
import com.geitus.app.company.ConflitoDeEmpresaException;
import com.geitus.app.company.DadosEmpresaInvalidosException;

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
     * Violacao de regra de negocio do modulo Produtos com dado invalido (por
     * exemplo, nome vazio ou preco/custo/estoque negativo) -> 400. Conflitos de
     * unicidade (SKU/codigo de barras duplicado) usam {@code ProdutoConflitoException}
     * e retornam 409.
     */
    @ExceptionHandler(RegraDeNegocioException.class)
    public ResponseEntity<ApiError> tratarRegraDeNegocio(RegraDeNegocioException ex, HttpServletRequest request) {
        ApiError corpo = ApiError.de(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI());

        return ResponseEntity.badRequest().body(corpo);
    }

    /**
     * Conflito de unicidade no modulo Produtos (SKU ou codigo de barras ja
     * usado por outro produto da mesma empresa). Mapeado para HTTP 409.
     */
    @ExceptionHandler(ProdutoConflitoException.class)
    public ResponseEntity<ApiError> tratarConflitoDeProduto(ProdutoConflitoException ex,
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

    private ApiError.CampoInvalido mapearCampo(FieldError erro) {
        return new ApiError.CampoInvalido(erro.getField(), erro.getDefaultMessage());
    }
}
