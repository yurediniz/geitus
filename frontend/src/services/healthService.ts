import { apiGet } from '@/services/httpClient'

/**
 * Resposta do endpoint de health check do backend (GET /api/health).
 */
export interface HealthResponse {
  status: string
  aplicacao: string
  timestamp: string
}

/**
 * Consulta o status de saude do backend.
 */
export function getHealth(): Promise<HealthResponse> {
  return apiGet<HealthResponse>('/health')
}
