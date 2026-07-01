package com.upeflow.erpell.shared;

import java.time.OffsetDateTime;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpoint simples de verificacao de saude da aplicacao.
 *
 * <p>Serve para confirmar rapidamente que a API esta no ar. E a unica rota
 * liberada sem autenticacao nesta etapa inicial.
 */
@RestController
@RequestMapping("/api/health")
public class HealthController {

    @GetMapping
    public Map<String, Object> health() {
        return Map.of(
                "status", "UP",
                "aplicacao", "ERPell",
                "timestamp", OffsetDateTime.now().toString());
    }
}
