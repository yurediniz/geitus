package com.upeflow.erpell.shared.error;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;

/**
 * Tratador global de erros da API do ERPell.
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
